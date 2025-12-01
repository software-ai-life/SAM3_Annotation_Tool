import axios from 'axios';
import type { 
  ImageInfo, 
  SegmentationResult, 
  Point, 
  BoundingBox,
  Annotation,
  Category,
  COCOExport
} from '../types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60 seconds for segmentation
});

type UploadResponse = {
  id?: string;
  image_id?: string;
  file_name?: string;
  width?: number;
  height?: number;
  image_url?: string;  // 後端轉換後的 data URL
};

/**
 * 上傳圖片
 */
export async function uploadImage(file: File): Promise<ImageInfo> {
  console.log('[uploadImage] 開始處理檔案:', file.name, file.type, file.size);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<UploadResponse>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 分鐘，大檔案需要更長時間
    });

    const data = response.data;
    console.log('[uploadImage] 後端回應:', data);

    // 優先使用後端轉換的 image_url（可處理 BMP 等瀏覽器不支援的格式）
    const imageUrl = data.image_url || '';
    
    const result: ImageInfo = {
      id: data.id || data.image_id || `img_${Date.now()}`,
      fileName: data.file_name || file.name,
      width: data.width ?? 800,
      height: data.height ?? 600,
      url: imageUrl,
      file,
      isLocalOnly: false
    };
    console.log('[uploadImage] 回傳 ImageInfo:', result.id, '圖片URL長度:', imageUrl.length);
    return result;
  } catch (error) {
    console.warn('[uploadImage] 後端上傳失敗，嘗試本地轉換：', error);

    // 後端失敗時，嘗試本地轉換
    try {
      const { url: imageUrl, width, height } = await convertImageToDataUrl(file);
      const result: ImageInfo = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        width,
        height,
        url: imageUrl,
        file,
        isLocalOnly: true
      };
      console.log('[uploadImage] 回傳本地 ImageInfo:', result.id);
      return result;
    } catch (localError) {
      console.error('[uploadImage] 本地轉換也失敗:', localError);
      throw new Error(`無法載入圖片 ${file.name}：格式不支援或檔案損壞`);
    }
  }
}

/**
 * 將圖片檔案轉換為 Data URL (透過 canvas 確保相容性)
 * 這可以處理 BMP 等瀏覽器原生支援有限的格式
 */
async function convertImageToDataUrl(file: File): Promise<{ url: string; width: number; height: number }> {
  console.log('[convertImageToDataUrl] 開始轉換:', file.name, file.type);
  
  try {
    // 方法 1: 使用 createImageBitmap (最可靠，支援 BMP)
    const imageBitmap = await createImageBitmap(file);
    console.log('[convertImageToDataUrl] createImageBitmap 成功:', imageBitmap.width, 'x', imageBitmap.height);
    
    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('無法建立 canvas context');
    }
    
    ctx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close(); // 釋放資源
    
    // 轉換為 JPEG data URL (減少大小)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    console.log('[convertImageToDataUrl] 轉換完成，data URL 長度:', dataUrl.length);
    
    return {
      url: dataUrl,
      width: canvas.width,
      height: canvas.height
    };
  } catch (bitmapError) {
    console.warn('[convertImageToDataUrl] createImageBitmap 失敗，嘗試 Image 元素:', bitmapError);
    
    // 方法 2: 備援使用 Image 元素
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('無法建立 canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        URL.revokeObjectURL(objectUrl);
        
        resolve({
          url: dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      
      img.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        console.error('[convertImageToDataUrl] Image 載入也失敗:', e);
        reject(new Error(`無法載入圖片: ${file.name}`));
      };
      
      img.src = objectUrl;
    });
  }
}

/**
 * 文字提示分割
 */
export async function segmentWithText(
  imageId: string,
  prompt: string,
  confidenceThreshold: number = 0.5
): Promise<SegmentationResult[]> {
  const response = await api.post<{
    image_id: string;
    results: SegmentationResult[];
  }>('/segment/text', {
    image_id: imageId,
    prompt,
    confidence_threshold: confidenceThreshold
  });
  
  return response.data.results;
}

/**
 * 點提示分割
 * @param resetMask - 是否重置 mask 狀態（開始新標註時設為 true）
 */
export async function segmentWithPoints(
  imageId: string,
  points: Point[],
  confidenceThreshold: number = 0.5,
  resetMask: boolean = false
): Promise<SegmentationResult[]> {
  const response = await api.post<{
    image_id: string;
    results: SegmentationResult[];
  }>('/segment/points', {
    image_id: imageId,
    points: points.map(p => ({ x: p.x, y: p.y, label: p.label })),
    confidence_threshold: confidenceThreshold,
    reset_mask: resetMask
  });
  
  return response.data.results;
}

/**
 * 重置 mask 狀態（開始新標註前呼叫）
 */
export async function resetMaskState(imageId: string): Promise<boolean> {
  const response = await api.post<{
    success: boolean;
    reset: boolean;
    image_id: string;
  }>(`/segment/reset-mask/${imageId}`);
  
  return response.data.success;
}

/**
 * 框選分割
 */
export async function segmentWithBox(
  imageId: string,
  box: BoundingBox,
  label: boolean = true,
  confidenceThreshold: number = 0.5
): Promise<SegmentationResult[]> {
  const response = await api.post<{
    image_id: string;
    results: SegmentationResult[];
  }>('/segment/box', {
    image_id: imageId,
    box: { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 },
    label,
    confidence_threshold: confidenceThreshold
  });
  
  return response.data.results;
}

/**
 * 模板比對分割
 */
export async function segmentWithTemplate(
  imageId: string,
  templateImageId: string,
  templateBox: BoundingBox,
  confidenceThreshold: number = 0.5
): Promise<SegmentationResult[]> {
  const response = await api.post<{
    image_id: string;
    results: SegmentationResult[];
  }>('/segment/template', {
    image_id: imageId,
    template_image_id: templateImageId,
    template_box: {
      x1: templateBox.x1,
      y1: templateBox.y1,
      x2: templateBox.x2,
      y2: templateBox.y2
    },
    confidence_threshold: confidenceThreshold
  });
  
  return response.data.results;
}

/**
 * 導出 COCO JSON
 */
export async function exportCOCO(
  images: ImageInfo[],
  annotations: Annotation[],
  categories: Category[]
): Promise<COCOExport> {
  const response = await api.post<COCOExport>('/export/coco', {
    images: images.map(img => ({
      id: img.id,
      file_name: img.fileName,
      width: img.width,
      height: img.height
    })),
    annotations: annotations.map((ann, idx) => ({
      id: idx + 1,
      image_id: ann.imageId,
      category_id: ann.categoryId,
      category_name: ann.categoryName,
      segmentation: ann.segmentation,
      bbox: ann.bbox,
      area: ann.area,
      score: ann.score
    })),
    categories: categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      supercategory: cat.supercategory || ''
    }))
  });
  
  return response.data;
}

/**
 * 重置圖片提示
 */
export async function resetPrompts(imageId: string): Promise<void> {
  await api.post(`/reset/${imageId}`);
}

/**
 * 下載 COCO JSON 檔案
 */
export function downloadCOCOJSON(cocoData: COCOExport, filename: string = 'annotations.json'): void {
  const blob = new Blob([JSON.stringify(cocoData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
