import { useEffect, useRef, useCallback, useState } from 'react';
import { useAnnotationStore } from '../store/annotationStore';
import type { AutoSaveData, Annotation, Category } from '../types';

const AUTO_SAVE_KEY = 'sam3_annotation_autosave';
const DEBOUNCE_MS = 2000; // 2 秒防抖

/**
 * 取得暫存資料
 */
export function getAutoSaveData(): AutoSaveData | null {
  try {
    const data = localStorage.getItem(AUTO_SAVE_KEY);
    if (!data) return null;
    
    const parsed = JSON.parse(data) as AutoSaveData;
    
    // 驗證資料格式
    if (!parsed.version || !parsed.images || !parsed.annotations) {
      return null;
    }
    
    return parsed;
  } catch (err) {
    console.warn('[AutoSave] 讀取暫存資料失敗:', err);
    return null;
  }
}

/**
 * 清除暫存資料
 */
export function clearAutoSaveData(): void {
  try {
    localStorage.removeItem(AUTO_SAVE_KEY);
    console.log('[AutoSave] 暫存資料已清除');
  } catch (err) {
    console.warn('[AutoSave] 清除暫存資料失敗:', err);
  }
}

/**
 * 檢查是否有暫存資料
 */
export function hasAutoSaveData(): boolean {
  return getAutoSaveData() !== null;
}

/**
 * 自動暫存 Hook
 * 返回暫存狀態供 UI 顯示
 */
export function useAutoSave() {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const {
    images,
    annotations,
    categories,
    currentImage,
    currentCategoryId
  } = useAnnotationStore();

  // 儲存到 localStorage
  const saveToLocalStorage = useCallback(() => {
    // 如果沒有任何資料，不儲存
    if (images.length === 0 && annotations.length === 0 && categories.length === 0) {
      return;
    }

    setIsSaving(true);
    
    try {
      const now = new Date();
      const autoSaveData: AutoSaveData = {
        version: '1.0',
        savedAt: now.toISOString(),
        images: images.map(img => ({
          id: img.id,
          fileName: img.fileName,
          width: img.width,
          height: img.height
        })),
        annotations: annotations.map(ann => ({
          ...ann,
          selected: false // 清除選擇狀態
        })),
        categories,
        currentImageFileName: currentImage?.fileName || null,
        currentCategoryId
      };

      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(autoSaveData));
      setLastSavedAt(now);
      console.log('[AutoSave] 已自動暫存', {
        images: images.length,
        annotations: annotations.length,
        categories: categories.length
      });
    } catch (err) {
      console.warn('[AutoSave] 自動暫存失敗:', err);
    } finally {
      setIsSaving(false);
    }
  }, [images, annotations, categories, currentImage, currentCategoryId]);

  // 防抖儲存
  const debouncedSave = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      saveToLocalStorage();
    }, DEBOUNCE_MS);
  }, [saveToLocalStorage]);

  // 監聽變更並自動儲存
  useEffect(() => {
    debouncedSave();
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [images, annotations, categories, debouncedSave]);

  // 頁面關閉前立即儲存
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 取消防抖，立即儲存
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      saveToLocalStorage();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveToLocalStorage]);

  return {
    saveNow: saveToLocalStorage,
    lastSavedAt,
    isSaving
  };
}

/**
 * 根據檔名比對並恢復標註
 * @param autoSaveData 暫存資料
 * @param newImages 新上傳的圖片列表
 * @returns 比對結果
 */
export function matchAndRestoreAnnotations(
  autoSaveData: AutoSaveData,
  newImages: Array<{ id: string; fileName: string; width: number; height: number }>
): {
  matchedAnnotations: Annotation[];
  matchedCategories: Category[];
  matchedCount: number;
  unmatchedCount: number;
  currentImageId: string | null;
} {
  // 建立新圖片的檔名到 ID 的映射
  const fileNameToNewId = new Map<string, string>();
  newImages.forEach(img => {
    fileNameToNewId.set(img.fileName, img.id);
  });

  // 建立舊圖片 ID 到新圖片 ID 的映射
  const oldIdToNewId = new Map<string, string>();
  autoSaveData.images.forEach(oldImg => {
    const newId = fileNameToNewId.get(oldImg.fileName);
    if (newId) {
      oldIdToNewId.set(oldImg.id, newId);
    }
  });

  // 轉換標註的 imageId
  const matchedAnnotations: Annotation[] = [];
  let unmatchedCount = 0;

  autoSaveData.annotations.forEach(ann => {
    const newImageId = oldIdToNewId.get(ann.imageId);
    if (newImageId) {
      matchedAnnotations.push({
        ...ann,
        imageId: newImageId,
        // 生成新的標註 ID 避免衝突
        id: `restored_${ann.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      });
    } else {
      unmatchedCount++;
    }
  });

  // 找到當前圖片
  let currentImageId: string | null = null;
  if (autoSaveData.currentImageFileName) {
    currentImageId = fileNameToNewId.get(autoSaveData.currentImageFileName) || null;
  }

  return {
    matchedAnnotations,
    matchedCategories: autoSaveData.categories,
    matchedCount: matchedAnnotations.length,
    unmatchedCount,
    currentImageId
  };
}
