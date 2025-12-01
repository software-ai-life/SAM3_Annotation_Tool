/**
 * 標註工具類型
 */
export type AnnotationTool = 
  | 'pointer'      // 選擇工具
  | 'add-point'    // 增點工具
  | 'remove-point' // 減點工具
  | 'box'          // 框選工具
  | 'text'         // 文字提示工具
  | 'template'     // 模板比對工具
  | 'polygon';     // 手動多邊形標註工具（不依賴 SAM3）

/**
 * 點座標 (含正負標籤)
 */
export interface Point {
  x: number;
  y: number;
  label: 1 | 0;  // 1=正點, 0=負點
}

/**
 * 邊界框
 */
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * RLE 編碼遮罩
 */
export interface RLEMask {
  counts: number[];
  size: [number, number];
}

/**
 * 預覽遮罩（點分割時的即時預覽）
 */
export interface PreviewMask {
  mask_rle: RLEMask;
  box: [number, number, number, number];
  score: number;
  area: number;
}

/**
 * 分割結果
 */
export interface SegmentationResult {
  mask_rle: RLEMask;
  box: [number, number, number, number];
  score: number;
  area: number;
}

/**
 * 單個標註
 */
export interface Annotation {
  id: string;
  imageId: string;
  categoryId: number;
  categoryName: string;
  segmentation: RLEMask;
  bbox: [number, number, number, number]; // [x, y, width, height]
  area: number;
  score: number;
  color: string;
  visible: boolean;
  selected: boolean;
}

/**
 * 圖片資訊
 */
export interface ImageInfo {
  id: string;
  fileName: string;
  width: number;
  height: number;
  url: string;
  /** 原始檔案參照，用於需要時重新產生 URL */
  file?: File;
  isLocalOnly?: boolean;
}

/**
 * 類別
 */
export interface Category {
  id: number;
  name: string;
  color: string;
  supercategory?: string;
}

/**
 * 標註歷史記錄 (用於撤銷/重做)
 */
export interface HistoryState {
  annotations: Annotation[];
  timestamp: number;
}

/**
 * 應用狀態
 */
export interface AppState {
  // 圖片狀態
  currentImage: ImageInfo | null;
  images: ImageInfo[];
  
  // 標註狀態
  annotations: Annotation[];
  selectedAnnotationIds: string[];
  copiedAnnotations: Annotation[];  // 複製的標註
  
  // 工具狀態
  currentTool: AnnotationTool;
  confidenceThreshold: number;
  
  // 臨時繪圖狀態
  tempPoints: Point[];
  tempBox: BoundingBox | null;
  textPrompt: string;
  previewMask: PreviewMask | null;  // 點分割預覽遮罩
  polygonPoints: { x: number; y: number }[];  // 手動多邊形繪製的頂點
  
  // 模板狀態
  templateImage: ImageInfo | null;
  templateBox: BoundingBox | null;
  
  // 貼上預覽狀態
  isPasting: boolean;  // 是否處於貼上模式
  pasteOffset: { x: number; y: number } | null;  // 貼上位置偏移
  
  // 類別
  categories: Category[];
  currentCategoryId: number;
  
  // 歷史記錄
  history: HistoryState[];
  historyIndex: number;
  
  // UI 狀態
  isLoading: boolean;
  error: string | null;
  showShortcuts: boolean;
}

/**
 * 快捷鍵定義
 */
export interface ShortcutKey {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  action: string;
}

/**
 * 專案儲存格式（用於儲存/載入完整專案狀態）
 */
export interface ProjectData {
  version: string;  // 專案格式版本
  savedAt: string;  // 儲存時間 ISO 格式
  images: Array<{
    id: string;
    fileName: string;
    width: number;
    height: number;
    url: string;  // base64 data URL
  }>;
  annotations: Annotation[];
  categories: Category[];
  currentImageId: string | null;
  currentCategoryId: number;
}

/**
 * 自動暫存格式（不含圖片資料，只存 metadata）
 */
export interface AutoSaveData {
  version: string;
  savedAt: string;
  images: Array<{
    id: string;
    fileName: string;
    width: number;
    height: number;
    // 不存 url，恢復時需重新選擇圖片
  }>;
  annotations: Annotation[];
  categories: Category[];
  currentImageFileName: string | null;  // 用檔名而非 id，方便比對
  currentCategoryId: number;
}

/**
 * COCO 格式導出
 */
export interface COCOExport {
  info: {
    description: string;
    version: string;
    year: number;
    date_created: string;
  };
  licenses: Array<{
    id: number;
    name: string;
    url: string;
  }>;
  images: Array<{
    id: number;
    file_name: string;
    width: number;
    height: number;
  }>;
  annotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    segmentation: RLEMask;
    bbox: [number, number, number, number];
    area: number;
    iscrowd: number;
    score?: number;
  }>;
  categories: Array<{
    id: number;
    name: string;
    supercategory: string;
  }>;
}
