/**
 * 標註工具類型
 */
export type AnnotationTool = 
  | 'pointer'      // 選擇工具
  | 'add-point'    // 增點工具
  | 'remove-point' // 減點工具
  | 'box'          // 框選工具
  | 'text'         // 文字提示工具
  | 'template';    // 模板比對工具

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
  
  // 模板狀態
  templateImage: ImageInfo | null;
  templateBox: BoundingBox | null;
  
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
