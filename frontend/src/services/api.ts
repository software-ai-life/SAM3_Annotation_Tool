import axios from 'axios';
import JSZip from 'jszip';
import type { 
  ImageInfo, 
  SegmentationResult, 
  Point, 
  BoundingBox,
  Annotation,
  Category,
  COCOExport,
  ProjectData
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

// /**
//  * 將 Polygon 轉換為 RLE mask
//  */
// function polygonToRLE(points: number[], width: number, height: number): { counts: number[]; size: [number, number] } {
//   // 建立空的 mask (row-major order: height * width)
//   const mask = new Uint8Array(height * width);
  
//   // 將 points [x1,y1,x2,y2,...] 轉換為座標陣列
//   const vertices: Array<{ x: number; y: number }> = [];
//   for (let i = 0; i < points.length; i += 2) {
//     vertices.push({ x: points[i], y: points[i + 1] });
//   }
  
//   if (vertices.length < 3) {
//     return { counts: [height * width], size: [height, width] };
//   }
  
//   // 使用掃描線演算法填充多邊形
//   const minY = Math.max(0, Math.floor(Math.min(...vertices.map(v => v.y))));
//   const maxY = Math.min(height - 1, Math.ceil(Math.max(...vertices.map(v => v.y))));
  
//   for (let y = minY; y <= maxY; y++) {
//     const intersections: number[] = [];
    
//     for (let i = 0; i < vertices.length; i++) {
//       const v1 = vertices[i];
//       const v2 = vertices[(i + 1) % vertices.length];
      
//       // 檢查這條邊是否與掃描線相交
//       if ((v1.y <= y && v2.y > y) || (v2.y <= y && v1.y > y)) {
//         // 計算交點的 x 座標
//         const x = v1.x + (y - v1.y) / (v2.y - v1.y) * (v2.x - v1.x);
//         intersections.push(x);
//       }
//     }
    
//     // 排序交點
//     intersections.sort((a, b) => a - b);
    
//     // 填充成對的交點之間的像素
//     for (let i = 0; i < intersections.length; i += 2) {
//       if (i + 1 < intersections.length) {
//         const x1 = Math.max(0, Math.floor(intersections[i]));
//         const x2 = Math.min(width - 1, Math.ceil(intersections[i + 1]));
//         for (let x = x1; x <= x2; x++) {
//           mask[y * width + x] = 1;  // row-major: y * width + x
//         }
//       }
//     }
//   }
  
//   // 轉換為 RLE (row-major order，符合 SAM3 內部格式)
//   // 依序走訪 mask: row 0 從左到右, row 1 從左到右, ...
//   const counts: number[] = [];
//   let currentValue = 0;  // RLE 從 0 開始（背景）
//   let currentCount = 0;
  
//   for (let i = 0; i < mask.length; i++) {
//     const value = mask[i];
//     if (value === currentValue) {
//       currentCount++;
//     } else {
//       counts.push(currentCount);
//       currentValue = value;
//       currentCount = 1;
//     }
//   }
//   counts.push(currentCount);
  
//   return { counts, size: [height, width] };
// }

// /**
//  * 從 polygon points 計算 bbox
//  */
// function calculateBboxFromPolygon(points: number[]): [number, number, number, number] {
//   let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
//   for (let i = 0; i < points.length; i += 2) {
//     const x = points[i];
//     const y = points[i + 1];
//     minX = Math.min(minX, x);
//     minY = Math.min(minY, y);
//     maxX = Math.max(maxX, x);
//     maxY = Math.max(maxY, y);
//   }
  
//   return [minX, minY, maxX - minX, maxY - minY];
// }

// /**
//  * 計算 polygon 面積（使用 Shoelace 公式）
//  */
// function calculatePolygonArea(points: number[]): number {
//   let area = 0;
//   const n = points.length / 2;
  
//   for (let i = 0; i < n; i++) {
//     const x1 = points[i * 2];
//     const y1 = points[i * 2 + 1];
//     const x2 = points[((i + 1) % n) * 2];
//     const y2 = points[((i + 1) % n) * 2 + 1];
//     area += x1 * y2 - x2 * y1;
//   }
  
//   return Math.abs(area) / 2;
// }


// ==================== 原有的 API ====================

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
 * 將 Data URL 轉換為 Blob
 */
function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * 取得檔案副檔名
 */
function getExtensionFromMime(mime: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/gif': '.gif'
  };
  return mimeToExt[mime] || '.png';
}

/**
 * 導出 COCO JSON 和圖片為 ZIP 檔案
 */
export async function downloadCOCOWithImages(
  cocoData: COCOExport,
  images: ImageInfo[],
  filename: string = 'annotations_coco.zip'
): Promise<void> {
  const zip = new JSZip();
  
  // 加入 COCO JSON
  zip.file('instances_default.json', JSON.stringify(cocoData, null, 2));
  
  // 加入所有圖片（與 JSON 同一層）
  for (const img of images) {
    if (img.url) {
      try {
        if (img.url.startsWith('data:')) {
          // Data URL 格式
          const blob = dataURLtoBlob(img.url);
          const ext = getExtensionFromMime(blob.type);
          // 確保檔名有正確的副檔名
          const fileName = img.fileName.includes('.') ? img.fileName : `${img.fileName}${ext}`;
          zip.file(fileName, blob);
        } else if (img.url.startsWith('blob:')) {
          // Blob URL 格式 - 需要 fetch
          const response = await fetch(img.url);
          const blob = await response.blob();
          const ext = getExtensionFromMime(blob.type);
          const fileName = img.fileName.includes('.') ? img.fileName : `${img.fileName}${ext}`;
          zip.file(fileName, blob);
        }
      } catch (err) {
        console.warn(`[downloadCOCOWithImages] 無法加入圖片 ${img.fileName}:`, err);
      }
    }
  }
  
  // 產生 ZIP 並下載
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 下載 COCO JSON 檔案（僅下載 JSON，不含圖片）
 */
export function downloadCOCOJSON(cocoData: COCOExport, filename: string = 'instances_default.json'): void {
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

// ==================== YOLO 格式導出 ====================

/**
 * RLE 解碼為二值 mask 陣列
 */
function rleToMask(rle: { counts: number[]; size: [number, number] }): boolean[][] {
  const [height, width] = rle.size;
  const mask: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  
  let idx = 0;
  let value = false;
  
  for (const count of rle.counts) {
    for (let i = 0; i < count; i++) {
      const row = idx % height;
      const col = Math.floor(idx / height);
      if (row < height && col < width) {
        mask[row][col] = value;
      }
      idx++;
    }
    value = !value;
  }
  
  return mask;
}

/**
 * 從二值 mask 提取輪廓點 (簡化版 marching squares)
 */
function maskToPolygon(mask: boolean[][], width: number, height: number): number[][] {
  const contours: number[][] = [];
  
  // 找到所有邊界點
  const edgePoints: Array<{ x: number; y: number }> = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y][x]) {
        // 檢查是否為邊界點 (至少有一個鄰居是背景)
        const isEdge = 
          x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
          !mask[y - 1]?.[x] || !mask[y + 1]?.[x] ||
          !mask[y]?.[x - 1] || !mask[y]?.[x + 1];
        
        if (isEdge) {
          edgePoints.push({ x, y });
        }
      }
    }
  }
  
  if (edgePoints.length === 0) return contours;
  
  // 簡化：對邊界點進行排序和採樣
  // 使用角度排序來形成閉合多邊形
  const centerX = edgePoints.reduce((sum, p) => sum + p.x, 0) / edgePoints.length;
  const centerY = edgePoints.reduce((sum, p) => sum + p.y, 0) / edgePoints.length;
  
  edgePoints.sort((a, b) => {
    const angleA = Math.atan2(a.y - centerY, a.x - centerX);
    const angleB = Math.atan2(b.y - centerY, b.x - centerX);
    return angleA - angleB;
  });
  
  // 採樣減少點數 (最多保留 100 個點)
  const maxPoints = 100;
  const step = Math.max(1, Math.floor(edgePoints.length / maxPoints));
  const sampledPoints: number[] = [];
  
  for (let i = 0; i < edgePoints.length; i += step) {
    sampledPoints.push(edgePoints[i].x, edgePoints[i].y);
  }
  
  if (sampledPoints.length >= 6) {  // 至少 3 個點
    contours.push(sampledPoints);
  }
  
  return contours;
}

/**
 * 將標註轉換為 YOLO 格式
 * YOLO segmentation 格式: class_id x1 y1 x2 y2 ... xn yn (normalized 0-1)
 * YOLO detection 格式: class_id x_center y_center width height (normalized 0-1)
 */
function annotationToYOLO(
  annotation: Annotation,
  imageWidth: number,
  imageHeight: number,
  categoryIndexMap: Map<number, number>,
  useSegmentation: boolean = true
): string {
  const classId = categoryIndexMap.get(annotation.categoryId) ?? 0;
  
  if (useSegmentation && annotation.segmentation) {
    // Segmentation 格式: 轉換 RLE 為 polygon
    try {
      const mask = rleToMask(annotation.segmentation);
      const polygons = maskToPolygon(mask, imageWidth, imageHeight);
      
      if (polygons.length > 0 && polygons[0].length >= 6) {
        // 正規化座標到 0-1
        const normalizedPoints = polygons[0].map((val, idx) => 
          idx % 2 === 0 
            ? (val / imageWidth).toFixed(6)   // x
            : (val / imageHeight).toFixed(6)  // y
        );
        return `${classId} ${normalizedPoints.join(' ')}`;
      }
    } catch (err) {
      console.warn('[annotationToYOLO] RLE 轉換失敗，改用 bbox:', err);
    }
  }
  
  // 使用 bbox (detection 格式)
  const [x, y, w, h] = annotation.bbox;
  const xCenter = ((x + w / 2) / imageWidth).toFixed(6);
  const yCenter = ((y + h / 2) / imageHeight).toFixed(6);
  const normW = (w / imageWidth).toFixed(6);
  const normH = (h / imageHeight).toFixed(6);
  
  return `${classId} ${xCenter} ${yCenter} ${normW} ${normH}`;
}

/**
 * 導出 YOLO 格式為 ZIP 檔案
 * 
 * 結構:
 * - obj.data (資料集配置)
 * - obj.names (類別名稱)
 * - train.txt (圖片路徑列表)
 * - obj_train_data/ (標籤檔案和圖片)
 */
export async function downloadYOLOWithImages(
  images: ImageInfo[],
  annotations: Annotation[],
  categories: Category[],
  filename: string = 'annotations_yolo.zip',
  useSegmentation: boolean = true,
  includeImages: boolean = true
): Promise<void> {
  const zip = new JSZip();
  
  // 建立 obj_train_data 資料夾
  const trainDataFolder = zip.folder('obj_train_data');
  
  // 建立 category index map (YOLO 使用 0-based index)
  const categoryIndexMap = new Map<number, number>();
  categories.forEach((cat, index) => {
    categoryIndexMap.set(cat.id, index);
  });
  
  // 建立 obj.names (類別名稱，每行一個)
  const objNames = categories.map(cat => cat.name).join('\n');
  zip.file('obj.names', objNames);
  
  // 建立 obj.data
  const objData = `classes = ${categories.length}
train = data/train.txt
names = data/obj.names
backup = backup/
`;
  zip.file('obj.data', objData);
  
  // 收集所有圖片路徑用於 train.txt
  const trainPaths: string[] = [];
  
  // 為每張圖片建立標註檔案
  for (const img of images) {
    // 取得這張圖片的所有標註
    const imgAnnotations = annotations.filter(ann => ann.imageId === img.id);
    
    // 轉換為 YOLO 格式
    const yoloLines = imgAnnotations.map(ann => 
      annotationToYOLO(ann, img.width, img.height, categoryIndexMap, useSegmentation)
    );
    
    // 建立標註檔案 (去掉副檔名，改為 .txt)
    const baseName = img.fileName.replace(/\.[^/.]+$/, '');
    if (trainDataFolder) {
      trainDataFolder.file(`${baseName}.txt`, yoloLines.join('\n'));
    }
    
    // 加入圖片路徑到 train.txt
    trainPaths.push(`data/obj_train_data/${img.fileName}`);
    
    // 加入圖片 (只有在 includeImages 為 true 時)
    if (includeImages && img.url && trainDataFolder) {
      try {
        if (img.url.startsWith('data:')) {
          const blob = dataURLtoBlob(img.url);
          const ext = getExtensionFromMime(blob.type);
          const fileName = img.fileName.includes('.') ? img.fileName : `${img.fileName}${ext}`;
          trainDataFolder.file(fileName, blob);
        } else if (img.url.startsWith('blob:')) {
          const response = await fetch(img.url);
          const blob = await response.blob();
          const ext = getExtensionFromMime(blob.type);
          const fileName = img.fileName.includes('.') ? img.fileName : `${img.fileName}${ext}`;
          trainDataFolder.file(fileName, blob);
        }
      } catch (err) {
        console.warn(`[downloadYOLOWithImages] 無法加入圖片 ${img.fileName}:`, err);
      }
    }
  }
  
  // 建立 train.txt (圖片路徑列表)
  zip.file('train.txt', trainPaths.join('\n'));
  
  // 產生 ZIP 並下載
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 儲存專案到檔案
 */
export function saveProject(
  images: ImageInfo[],
  annotations: Annotation[],
  categories: Category[],
  currentImageId: string | null,
  currentCategoryId: number
): void {
  const projectData: ProjectData = {
    version: '1.0',
    savedAt: new Date().toISOString(),
    images: images.map(img => ({
      id: img.id,
      fileName: img.fileName,
      width: img.width,
      height: img.height,
      url: img.url  // base64 data URL
    })),
    annotations: annotations.map(ann => ({
      ...ann,
      selected: false  // 儲存時清除選擇狀態
    })),
    categories,
    currentImageId,
    currentCategoryId
  };

  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `project_${new Date().toISOString().slice(0, 10)}.sam3proj.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 載入專案檔案
 */
export async function loadProject(file: File): Promise<ProjectData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const projectData = JSON.parse(content) as ProjectData;
        
        // 驗證專案格式
        if (!projectData.version || !projectData.images || !projectData.annotations) {
          throw new Error('無效的專案檔案格式');
        }
        
        resolve(projectData);
      } catch (err) {
        reject(new Error('無法解析專案檔案'));
      }
    };
    reader.onerror = () => reject(new Error('無法讀取檔案'));
    reader.readAsText(file);
  });
}
