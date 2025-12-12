import { useCallback, useState, useEffect } from 'react';
import { Toolbar, ExportOptions } from './components/Toolbar';
import { AnnotationCanvas } from './components/AnnotationCanvas';
import { AnnotationList } from './components/AnnotationList';
import { TextPromptPanel } from './components/TextPromptPanel';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ImageNavigator } from './components/ImageNavigator';
import { TemplateIndicator } from './components/TemplateIndicator';
import { RecoveryModal } from './components/RecoveryModal';
import { AutoSaveIndicator } from './components/AutoSaveIndicator';
import { useAnnotationStore } from './store/annotationStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSave, getAutoSaveData, clearAutoSaveData, matchAndRestoreAnnotations } from './hooks/useAutoSave';
import * as api from './services/api';
import type { SegmentationResult, ImageInfo, AutoSaveData } from './types';

function App() {
  // 恢復模式狀態
  const [pendingRecovery, setPendingRecovery] = useState<AutoSaveData | null>(null);
  
  const {
    currentImage,
    setImages,
    setCurrentImage,
    addAnnotations,
    setAnnotations,
    currentCategoryId,
    setCurrentCategoryId,
    categories,
    setCategories,
    tempPoints,
    tempBox,
    textPrompt,
    clearTempPoints,
    setTempBox,
    setLoading,
    setError,
    isLoading,
    error,
    confidenceThreshold,
    images,
    annotations
  } = useAnnotationStore();

  // 啟用自動暫存
  const { lastSavedAt, isSaving } = useAutoSave();

  // 檢查是否有暫存資料需要恢復
  useEffect(() => {
    const autoSaveData = getAutoSaveData();
    if (autoSaveData && autoSaveData.annotations.length > 0) {
      setPendingRecovery(autoSaveData);
    }
  }, []);

  // 處理分割結果
  const handleSegmentationResults = useCallback((results: SegmentationResult[]) => {
    console.log('[handleSegmentationResults] 開始處理', results.length, '個結果');
    console.log('[handleSegmentationResults] currentCategoryId:', currentCategoryId);
    
    if (currentCategoryId === 0) {
      setError('請先新增並選擇一個類別');
      console.log('[handleSegmentationResults] 沒有選擇類別，返回');
      return;
    }
    
    const category = categories.find(c => c.id === currentCategoryId);
    console.log('[handleSegmentationResults] 使用類別:', category?.name);
    
    // 批次新增所有標註（只觸發一次狀態更新）
    const annotationsToAdd = results.map(result => ({
      imageId: currentImage!.id,
      categoryId: currentCategoryId,
      categoryName: category?.name || '未分類',
      segmentation: result.mask_rle,
      bbox: result.box,
      area: result.area,
      score: result.score
    }));
    
    addAnnotations(annotationsToAdd);
    console.log('[handleSegmentationResults] 完成，新增', annotationsToAdd.length, '個標註');
  }, [currentImage, currentCategoryId, categories, addAnnotations, setError]);

  // 處理確認操作（執行分割）
  const handleConfirm = useCallback(async () => {
    if (!currentImage) return;
    
    if (currentCategoryId === 0) {
      setError('請先新增並選擇一個類別');
      return;
    }
    
    if (currentImage.isLocalOnly) {
      setError('圖片尚未成功上傳至後端，無法進行分割。請確認後端服務後重新上傳圖片。');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      let results: SegmentationResult[] = [];
      
      // 根據當前模式執行分割
      if (tempPoints.length > 0) {
        results = await api.segmentWithPoints(
          currentImage.id,
          tempPoints,
          confidenceThreshold
        );
        clearTempPoints();
      } else if (tempBox) {
        results = await api.segmentWithBox(
          currentImage.id,
          tempBox,
          true,
          confidenceThreshold
        );
        setTempBox(null);
      } else if (textPrompt) {
        results = await api.segmentWithText(
          currentImage.id,
          textPrompt,
          confidenceThreshold
        );
      }
      
      if (results.length > 0) {
        handleSegmentationResults(results);
      } else {
        setError('未檢測到符合條件的物件');
      }
    } catch (err: any) {
      setError(err.message || '分割失敗');
    } finally {
      setLoading(false);
    }
  }, [
    currentImage,
    tempPoints,
    tempBox,
    textPrompt,
    confidenceThreshold,
    clearTempPoints,
    setTempBox,
    handleSegmentationResults,
    setLoading,
    setError
  ]);

  // 處理文字提示提交
  const handleTextSubmit = useCallback(async (prompt: string) => {
    console.log('[handleTextSubmit] 開始, prompt:', prompt);
    if (!currentImage) {
      console.log('[handleTextSubmit] 無當前圖片');
      return;
    }
    if (currentImage.isLocalOnly) {
      setError('圖片尚未成功上傳至後端，無法進行文字提示分割。請重新上傳並確認服務。');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('[handleTextSubmit] 呼叫 API, imageId:', currentImage.id);
      const results = await api.segmentWithText(
        currentImage.id,
        prompt,
        confidenceThreshold
      );
      
      console.log('[handleTextSubmit] 收到結果:', results.length, '個');
      
      if (results.length > 0) {
        handleSegmentationResults(results);
        console.log('[handleTextSubmit] 處理完成');
      } else {
        setError('未檢測到符合條件的物件');
      }
    } catch (err: any) {
      console.error('[handleTextSubmit] 錯誤:', err);
      setError(err.message || '分割失敗');
    } finally {
      console.log('[handleTextSubmit] 結束, 設定 loading=false');
      // 使用 setTimeout 確保 React 有機會渲染
      setTimeout(() => {
        setLoading(false);
        console.log('[handleTextSubmit] loading 已設為 false');
      }, 0);
    }
  }, [currentImage, confidenceThreshold, handleSegmentationResults, setLoading, setError]);

  // 處理上傳圖片
  const handleUploadImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const uploadedImages: ImageInfo[] = [];
      
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          console.warn(`跳過非圖片檔案: ${file.name}`);
          continue;
        }
        
        try {
          const imageInfo = await api.uploadImage(file);
          uploadedImages.push(imageInfo);
        } catch (err: any) {
          console.error(`上傳失敗 ${file.name}:`, err);
          setError(`上傳 ${file.name} 失敗: ${err.message}`);
        }
      }
      
      if (uploadedImages.length > 0) {
        // 添加到圖片列表
        setImages([...images, ...uploadedImages]);
        
        // 如果沒有當前圖片，設定第一張為當前圖片
        if (!currentImage) {
          setCurrentImage(uploadedImages[0]);
        }
        
        console.log(`成功上傳 ${uploadedImages.length} 張圖片`);
      }
    } catch (err: any) {
      setError(err.message || '上傳失敗');
    } finally {
      setLoading(false);
    }
  }, [images, currentImage, setImages, setCurrentImage, setLoading, setError]);

  // 處理導出 (支援多種格式)
  const handleExport = useCallback(async (options: ExportOptions) => {
    const { format, includeImages } = options;
    
    if (annotations.length === 0) {
      setError('沒有標註可以導出');
      return;
    }
    
    setLoading(true);
    
    try {
      switch (format) {
        case 'coco':
          const cocoData = await api.exportCOCO(images, annotations, categories);
          if (includeImages) {
            await api.downloadCOCOWithImages(cocoData, images, 'annotations_coco.zip');
          } else {
            api.downloadCOCOJSON(cocoData, 'instances_default.json');
          }
          break;
        case 'yolo-seg':
          await api.downloadYOLOWithImages(images, annotations, categories, 'annotations_yolo_seg.zip', true, includeImages);
          break;
        case 'yolo-bbox':
          await api.downloadYOLOWithImages(images, annotations, categories, 'annotations_yolo_bbox.zip', false, includeImages);
          break;
      }
    } catch (err: any) {
      setError(err.message || '導出失敗');
    } finally {
      setLoading(false);
    }
  }, [images, annotations, categories, setLoading, setError]);

  // 處理恢復暫存資料
  const handleRecovery = useCallback(async (files: FileList) => {
    if (!pendingRecovery) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 上傳圖片
      const uploadedImages: ImageInfo[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const imageInfo = await api.uploadImage(file);
        uploadedImages.push(imageInfo);
      }
      
      if (uploadedImages.length === 0) {
        setError('沒有找到有效的圖片檔案');
        setLoading(false);
        return;
      }
      
      // 比對並恢復標註
      const result = matchAndRestoreAnnotations(
        pendingRecovery,
        uploadedImages.map(img => ({
          id: img.id,
          fileName: img.fileName,
          width: img.width,
          height: img.height
        }))
      );
      
      // 設定圖片
      setImages(uploadedImages);
      
      // 設定類別
      if (result.matchedCategories.length > 0) {
        setCategories(result.matchedCategories);
        setCurrentCategoryId(pendingRecovery.currentCategoryId || result.matchedCategories[0].id);
      }
      
      // 設定標註
      if (result.matchedAnnotations.length > 0) {
        setAnnotations(result.matchedAnnotations);
      }
      
      // 設定當前圖片
      if (result.currentImageId) {
        const targetImage = uploadedImages.find(img => img.id === result.currentImageId);
        if (targetImage) {
          setCurrentImage(targetImage);
        }
      }
      
      // 顯示恢復結果
      if (result.unmatchedCount > 0) {
        setError(`已恢復 ${result.matchedCount} 個標註，${result.unmatchedCount} 個標註因圖片不符無法恢復`);
      } else {
        console.log(`[Recovery] 成功恢復 ${result.matchedCount} 個標註`);
      }
      
      // 清除暫存和恢復狀態
      clearAutoSaveData();
      setPendingRecovery(null);
      
    } catch (err: any) {
      setError(err.message || '恢復失敗');
    } finally {
      setLoading(false);
    }
  }, [pendingRecovery, setImages, setAnnotations, setCategories, setCurrentCategoryId, setCurrentImage, setLoading, setError]);

  // 處理捨棄暫存資料
  const handleDiscardRecovery = useCallback(() => {
    clearAutoSaveData();
    setPendingRecovery(null);
  }, []);

  // 設置快捷鍵
  useKeyboardShortcuts({
    onConfirm: handleConfirm
  });

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 工具列 */}
      <Toolbar 
        onExport={handleExport}
        onUploadImages={handleUploadImages}
      />

      {/* 圖片導航列 */}
      <ImageNavigator />
      
      {/* 主要內容區 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas 區域 */}
        <AnnotationCanvas onSegmentRequest={handleConfirm} />
        
        {/* 文字提示面板 */}
        <TextPromptPanel onSubmit={handleTextSubmit} />
        
        {/* 標註列表 */}
        <AnnotationList />
      </div>
      
      {/* 模板狀態指示器 */}
      <TemplateIndicator />
      
      {/* 自動暫存狀態指示器 */}
      <AutoSaveIndicator lastSavedAt={lastSavedAt} isSaving={isSaving} />
      
      {/* 載入指示器 */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="bg-white rounded-2xl p-6 shadow-2xl flex items-center gap-4">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-700 font-medium">處理中...</span>
          </div>
        </div>
      )}
      
      {/* 錯誤提示 */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-rose-500 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="hover:bg-rose-600 rounded-lg p-1 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* 快捷鍵說明彈窗 */}
      <ShortcutsModal />
      
      {/* 恢復暫存資料對話框 */}
      {pendingRecovery && (
        <RecoveryModal
          autoSaveData={pendingRecovery}
          onRecover={handleRecovery}
          onDiscard={handleDiscardRecovery}
        />
      )}
    </div>
  );
}

export default App;
