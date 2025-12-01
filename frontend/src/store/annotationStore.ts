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
  PreviewMask
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
  removeImage: (id: string) => void;
  
  // 標註操作
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'color' | 'visible' | 'selected'>) => void;
  addAnnotations: (annotations: Omit<Annotation, 'id' | 'color' | 'visible' | 'selected'>[]) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  deleteSelectedAnnotations: () => void;
  selectAnnotation: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  selectAll: () => void;
  toggleAnnotationVisibility: (id: string) => void;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  
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
  
  // 貼上標註到當前圖片
  pasteAnnotations: () => {
    const state = get();
    const { copiedAnnotations, currentImage, annotations } = state;
    
    if (copiedAnnotations.length === 0 || !currentImage) {
      console.log('[pasteAnnotations] 沒有可貼上的標註或沒有當前圖片');
      return;
    }
    
    // 計算偏移量（同圖片時稍微偏移避免完全重疊）
    const isSameImage = copiedAnnotations[0].imageId === currentImage.id;
    const offset = isSameImage ? 20 : 0;
    
    const newAnnotations = copiedAnnotations.map((ann, index) => {
      // 調整 bbox（偏移位置）
      const newBbox: [number, number, number, number] = [
        ann.bbox[0] + offset,
        ann.bbox[1] + offset,
        ann.bbox[2],
        ann.bbox[3]
      ];
      
      return {
        ...ann,
        id: `ann_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        imageId: currentImage.id,
        bbox: newBbox,
        selected: false
      };
    });
    
    set({
      annotations: [...annotations, ...newAnnotations],
      selectedAnnotationIds: newAnnotations.map(ann => ann.id)
    });
    
    console.log(`[pasteAnnotations] 貼上了 ${newAnnotations.length} 個標註到圖片 ${currentImage.id}`);
    get().saveToHistory();
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
