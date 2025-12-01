import { create } from 'zustand';
import type { 
  AppState, 
  Annotation, 
  AnnotationTool, 
  Point, 
  BoundingBox, 
  ImageInfo,
  Category,
  HistoryState,
  PreviewMask,
  RLEMask
} from '../types';

// 預設類別 - 空的，讓使用者自行新增
const DEFAULT_CATEGORIES: Category[] = [];

// 預設顏色池（使用者可自訂）
export const COLOR_PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E', '#78716C', '#64748B', '#0F172A',
];

// 生成顏色（按順序使用顏色池）
let colorIndex = 0;
const getNextColor = (): string => {
  const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  colorIndex++;
  return color;
};

/**
 * 解碼 RLE 遮罩為二進制陣列
 */
function decodeRLE(rle: RLEMask): Uint8Array {
  const [height, width] = rle.size;
  const mask = new Uint8Array(height * width);
  
  let idx = 0;
  let value = 0;
  
  for (const count of rle.counts) {
    for (let i = 0; i < count; i++) {
      if (idx < mask.length) {
        mask[idx] = value;
        idx++;
      }
    }
    value = 1 - value;
  }
  
  return mask;
}

/**
 * 編碼二進制陣列為 RLE 遮罩
 */
function encodeRLE(mask: Uint8Array, width: number, height: number): RLEMask {
  const counts: number[] = [];
  let currentValue = 0;
  let currentCount = 0;
  
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === currentValue) {
      currentCount++;
    } else {
      counts.push(currentCount);
      currentValue = mask[i];
      currentCount = 1;
    }
  }
  counts.push(currentCount);
  
  return {
    counts,
    size: [height, width]
  };
}

/**
 * 偏移 RLE 遮罩
 * 與 drawMask 使用相同的索引方式：idx 直接對應線性陣列索引
 * imageData 是 row-major：idx = y * width + x
 */
function offsetRLE(rle: RLEMask, offsetX: number, offsetY: number): RLEMask {
  const [height, width] = rle.size;
  const mask = decodeRLE(rle);
  
  // 建立新的遮罩陣列
  const newMask = new Uint8Array(height * width);
  
  const dx = Math.round(offsetX);
  const dy = Math.round(offsetY);
  
  // 遍歷原始遮罩，將每個像素移動到新位置
  // imageData 使用 row-major：idx = y * width + x
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const oldIdx = y * width + x;
      if (mask[oldIdx] === 1) {
        const newX = x + dx;
        const newY = y + dy;
        
        // 檢查新位置是否在範圍內
        if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
          const newIdx = newY * width + newX;
          newMask[newIdx] = 1;
        }
      }
    }
  }
  
  return encodeRLE(newMask, width, height);
}

const revokeImageUrl = (url?: string) => {
  if (typeof window === 'undefined' || !url) return;
  if (url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Failed to revoke object URL', err);
    }
  }
};

interface AnnotationStore extends AppState {
  // 圖片操作
  setCurrentImage: (image: ImageInfo | null) => void;
  addImage: (image: ImageInfo) => void;
  addImages: (images: ImageInfo[]) => void;
  setImages: (images: ImageInfo[]) => void;  // 載入專案時使用
  removeImage: (id: string) => void;
  
  // 標註操作
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'color' | 'visible' | 'selected'>) => void;
  addAnnotations: (annotations: Omit<Annotation, 'id' | 'color' | 'visible' | 'selected'>[]) => void;
  setAnnotations: (annotations: Annotation[]) => void;  // 載入專案時使用
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  deleteSelectedAnnotations: () => void;
  selectAnnotation: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  selectAll: () => void;
  toggleAnnotationVisibility: (id: string) => void;
  copySelectedAnnotations: () => void;
  startPasting: () => void;  // 進入貼上模式
  confirmPaste: (x: number, y: number) => void;  // 確認貼上到指定位置
  cancelPaste: () => void;  // 取消貼上模式
  
  // 工具操作
  setCurrentTool: (tool: AnnotationTool) => void;
  setConfidenceThreshold: (threshold: number) => void;
  
  // 臨時繪圖操作
  addTempPoint: (point: Point) => void;
  clearTempPoints: () => void;
  setTempBox: (box: BoundingBox | null) => void;
  setTextPrompt: (prompt: string) => void;
  setPreviewMask: (mask: PreviewMask | null) => void;
  
  // 模板操作
  setTemplateImage: (image: ImageInfo | null) => void;
  setTemplateBox: (box: BoundingBox | null) => void;
  
  // 類別操作
  setCurrentCategoryId: (id: number) => void;
  addCategory: (name: string, color?: string) => void;
  deleteCategory: (id: number) => void;
  updateCategory: (id: number, updates: Partial<Category>) => void;
  setCategories: (categories: Category[]) => void;  // 載入專案時使用
  
  // 歷史記錄操作
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  
  // UI 操作
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleShortcuts: () => void;
  
  // 重置
  reset: () => void;
}

const initialState: AppState = {
  currentImage: null,
  images: [],
  annotations: [],
  selectedAnnotationIds: [],
  copiedAnnotations: [],
  currentTool: 'pointer',
  confidenceThreshold: 0.5,
  tempPoints: [],
  tempBox: null,
  textPrompt: '',
  previewMask: null,
  templateImage: null,
  templateBox: null,
  isPasting: false,
  pasteOffset: null,
  categories: DEFAULT_CATEGORIES,
  currentCategoryId: 0,  // 0 表示尚無選擇的類別
  history: [],
  historyIndex: -1,
  isLoading: false,
  error: null,
  showShortcuts: false,
};

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  ...initialState,
  
  // 圖片操作
  setCurrentImage: (image) => set({ currentImage: image }),
  
  addImage: (image) => set((state) => ({
    images: [...state.images, image],
    currentImage: state.currentImage || image
  })),

  addImages: (newImages) => set((state) => ({
    images: [...state.images, ...newImages],
    currentImage: state.currentImage || newImages[0] || null
  })),

  // 載入專案時使用 - 直接設定圖片列表
  setImages: (images) => set((state) => {
    // 清理舊的 blob URLs
    state.images.forEach(img => revokeImageUrl(img.url));
    return {
      images,
      currentImage: images[0] || null
    };
  }),

  removeImage: (id) => set((state) => {
    const removedImage = state.images.find(img => img.id === id);
    if (removedImage) {
      revokeImageUrl(removedImage.url);
    }

    const newImages = state.images.filter(img => img.id !== id);
    const newAnnotations = state.annotations.filter(ann => ann.imageId !== id);
    let newCurrentImage = state.currentImage;
    
    if (state.currentImage?.id === id) {
      const currentIndex = state.images.findIndex(img => img.id === id);
      newCurrentImage = newImages[currentIndex] || newImages[currentIndex - 1] || null;
    }

    const newSelectedIds = state.selectedAnnotationIds.filter(aid =>
      newAnnotations.some(ann => ann.id === aid)
    );
    
    return {
      images: newImages,
      annotations: newAnnotations,
      currentImage: newCurrentImage,
      selectedAnnotationIds: newSelectedIds,
      templateImage: state.templateImage?.id === id ? null : state.templateImage
    };
  }),
  
  // 標註操作
  addAnnotation: (annotation) => {
    const state = get();
    const category = state.categories.find(c => c.id === annotation.categoryId);
    const newAnnotation: Annotation = {
      ...annotation,
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      color: category?.color || getNextColor(),
      visible: true,
      selected: false,
    };
    
    set((state) => ({
      annotations: [...state.annotations, newAnnotation]
    }));
    
    get().saveToHistory();
  },
  
  // 批次新增標註（避免多次狀態更新）
  addAnnotations: (annotationsToAdd) => {
    const state = get();
    const newAnnotations: Annotation[] = annotationsToAdd.map((annotation, index) => {
      const category = state.categories.find(c => c.id === annotation.categoryId);
      return {
        ...annotation,
        id: `ann_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        color: category?.color || getNextColor(),
        visible: true,
        selected: false,
      };
    });
    
    set((state) => ({
      annotations: [...state.annotations, ...newAnnotations]
    }));
    
    // 延遲保存歷史，避免阻塞 UI
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  // 載入專案時使用 - 直接設定標註列表
  setAnnotations: (annotations) => set({
    annotations,
    selectedAnnotationIds: []
  }),
  
  updateAnnotation: (id, updates) => {
    set((state) => ({
      annotations: state.annotations.map(ann => 
        ann.id === id ? { ...ann, ...updates } : ann
      )
    }));
    get().saveToHistory();
  },
  
  deleteAnnotation: (id) => {
    set((state) => ({
      annotations: state.annotations.filter(ann => ann.id !== id),
      selectedAnnotationIds: state.selectedAnnotationIds.filter(aid => aid !== id)
    }));
    get().saveToHistory();
  },
  
  deleteSelectedAnnotations: () => {
    set((state) => ({
      annotations: state.annotations.filter(
        ann => !state.selectedAnnotationIds.includes(ann.id)
      ),
      selectedAnnotationIds: []
    }));
    get().saveToHistory();
  },
  
  selectAnnotation: (id, multi = false) => {
    set((state) => {
      if (multi) {
        const isSelected = state.selectedAnnotationIds.includes(id);
        return {
          selectedAnnotationIds: isSelected
            ? state.selectedAnnotationIds.filter(aid => aid !== id)
            : [...state.selectedAnnotationIds, id],
          annotations: state.annotations.map(ann => ({
            ...ann,
            selected: isSelected
              ? ann.id !== id && state.selectedAnnotationIds.includes(ann.id)
              : ann.id === id || state.selectedAnnotationIds.includes(ann.id)
          }))
        };
      }
      return {
        selectedAnnotationIds: [id],
        annotations: state.annotations.map(ann => ({
          ...ann,
          selected: ann.id === id
        }))
      };
    });
  },
  
  deselectAll: () => set((state) => ({
    selectedAnnotationIds: [],
    annotations: state.annotations.map(ann => ({ ...ann, selected: false }))
  })),
  
  selectAll: () => set((state) => ({
    selectedAnnotationIds: state.annotations.map(ann => ann.id),
    annotations: state.annotations.map(ann => ({ ...ann, selected: true }))
  })),
  
  toggleAnnotationVisibility: (id) => set((state) => ({
    annotations: state.annotations.map(ann =>
      ann.id === id ? { ...ann, visible: !ann.visible } : ann
    )
  })),
  
  // 複製選中的標註
  copySelectedAnnotations: () => {
    const state = get();
    const selectedAnnotations = state.annotations.filter(
      ann => state.selectedAnnotationIds.includes(ann.id)
    );
    if (selectedAnnotations.length > 0) {
      set({ copiedAnnotations: selectedAnnotations });
      console.log(`[copySelectedAnnotations] 複製了 ${selectedAnnotations.length} 個標註`);
    }
  },
  
  // 進入貼上模式（Ctrl+V 觸發）
  startPasting: () => {
    const state = get();
    if (state.copiedAnnotations.length === 0) {
      console.log('[startPasting] 沒有可貼上的標註');
      return;
    }
    if (!state.currentImage) {
      console.log('[startPasting] 沒有當前圖片');
      return;
    }
    set({ isPasting: true, pasteOffset: { x: 0, y: 0 } });
    console.log('[startPasting] 進入貼上模式，請點擊目標位置');
  },
  
  // 確認貼上到指定位置
  confirmPaste: (clickX: number, clickY: number) => {
    const state = get();
    const { copiedAnnotations, currentImage, annotations } = state;
    
    if (copiedAnnotations.length === 0 || !currentImage) {
      set({ isPasting: false, pasteOffset: null });
      return;
    }
    
    // 從 mask 實際像素計算質心（與預覽一致）
    let totalPixelX = 0;
    let totalPixelY = 0;
    let totalPixels = 0;
    
    copiedAnnotations.forEach(ann => {
      const mask = decodeRLE(ann.segmentation);
      const [maskHeight, maskWidth] = ann.segmentation.size;
      
      for (let y = 0; y < maskHeight; y++) {
        for (let x = 0; x < maskWidth; x++) {
          const idx = y * maskWidth + x;
          if (mask[idx] === 1) {
            totalPixelX += x;
            totalPixelY += y;
            totalPixels++;
          }
        }
      }
    });
    
    const origCenterX = totalPixels > 0 ? totalPixelX / totalPixels : 0;
    const origCenterY = totalPixels > 0 ? totalPixelY / totalPixels : 0;
    
    // 計算偏移量：從質心到點擊位置
    const offsetX = clickX - origCenterX;
    const offsetY = clickY - origCenterY;
    
    const newAnnotations = copiedAnnotations.map((ann, index) => {
      // 調整 bbox（偏移位置）
      const newBbox: [number, number, number, number] = [
        ann.bbox[0] + offsetX,
        ann.bbox[1] + offsetY,
        ann.bbox[2],
        ann.bbox[3]
      ];
      
      // 偏移 RLE 遮罩
      const newSegmentation = offsetRLE(ann.segmentation, offsetX, offsetY);
      
      return {
        ...ann,
        id: `ann_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        imageId: currentImage.id,
        bbox: newBbox,
        segmentation: newSegmentation,
        selected: false
      };
    });
    
    set({
      annotations: [...annotations, ...newAnnotations],
      selectedAnnotationIds: newAnnotations.map(ann => ann.id),
      isPasting: false,
      pasteOffset: null
    });
    
    console.log(`[confirmPaste] 貼上了 ${newAnnotations.length} 個標註到位置 (${clickX}, ${clickY}), 偏移 (${offsetX}, ${offsetY})`);
    get().saveToHistory();
  },
  
  // 取消貼上模式
  cancelPaste: () => {
    set({ isPasting: false, pasteOffset: null });
    console.log('[cancelPaste] 取消貼上模式');
  },
  
  // 工具操作
  setCurrentTool: (tool) => set({ 
    currentTool: tool,
    tempPoints: [],
    tempBox: null,
    previewMask: null
  }),
  
  setConfidenceThreshold: (threshold) => set({ confidenceThreshold: threshold }),
  
  // 臨時繪圖操作
  addTempPoint: (point) => set((state) => ({
    tempPoints: [...state.tempPoints, point]
  })),
  
  clearTempPoints: () => set({ tempPoints: [], previewMask: null }),
  
  setTempBox: (box) => set({ tempBox: box }),
  
  setTextPrompt: (prompt) => set({ textPrompt: prompt }),
  
  setPreviewMask: (mask) => set({ previewMask: mask }),
  
  // 模板操作
  setTemplateImage: (image) => set({ templateImage: image }),
  
  setTemplateBox: (box) => set({ templateBox: box }),
  
  // 類別操作
  setCurrentCategoryId: (id) => set({ currentCategoryId: id }),
  
  addCategory: (name, color) => set((state) => {
    const maxId = state.categories.length > 0 
      ? Math.max(...state.categories.map(c => c.id)) 
      : 0;
    const newId = maxId + 1;
    const newCategory = {
      id: newId,
      name,
      color: color || getNextColor(),
      supercategory: ''
    };
    return {
      categories: [...state.categories, newCategory],
      currentCategoryId: state.currentCategoryId || newId
    };
  }),

  deleteCategory: (id) => set((state) => {
    const newCategories = state.categories.filter(c => c.id !== id);
    // 如果刪除的是當前類別，切換到第一個類別
    let newCurrentId = state.currentCategoryId;
    if (state.currentCategoryId === id) {
      newCurrentId = newCategories.length > 0 ? newCategories[0].id : 0;
    }
    return {
      categories: newCategories,
      currentCategoryId: newCurrentId
    };
  }),

  updateCategory: (id, updates) => set((state) => ({
    categories: state.categories.map(c => 
      c.id === id ? { ...c, ...updates } : c
    )
  })),
  
  // 載入專案時使用 - 直接設定類別列表
  setCategories: (categories) => set({
    categories,
    currentCategoryId: categories[0]?.id || 0
  }),
  
  // 歷史記錄操作
  saveToHistory: () => set((state) => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    const historyEntry: HistoryState = {
      annotations: JSON.parse(JSON.stringify(state.annotations)),
      timestamp: Date.now()
    };
    
    return {
      history: [...newHistory, historyEntry],
      historyIndex: newHistory.length
    };
  }),
  
  undo: () => set((state) => {
    if (state.historyIndex <= 0) return state;
    
    const prevIndex = state.historyIndex - 1;
    const prevState = state.history[prevIndex];
    
    return {
      annotations: JSON.parse(JSON.stringify(prevState.annotations)),
      historyIndex: prevIndex,
      selectedAnnotationIds: []
    };
  }),
  
  redo: () => set((state) => {
    if (state.historyIndex >= state.history.length - 1) return state;
    
    const nextIndex = state.historyIndex + 1;
    const nextState = state.history[nextIndex];
    
    return {
      annotations: JSON.parse(JSON.stringify(nextState.annotations)),
      historyIndex: nextIndex,
      selectedAnnotationIds: []
    };
  }),
  
  // UI 操作
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
  
  toggleShortcuts: () => set((state) => ({ showShortcuts: !state.showShortcuts })),
  
  // 重置
  reset: () => {
    const state = get();
    state.images.forEach(img => revokeImageUrl(img.url));
    if (state.templateImage) {
      revokeImageUrl(state.templateImage.url);
    }
    set({ ...initialState });
  },
}));
