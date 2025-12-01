import { X, Play, Image } from 'lucide-react';
import { useAnnotationStore } from '../store/annotationStore';
import { useEffect, useRef, useState, useCallback } from 'react';
import { segmentWithTemplate } from '../services/api';

/**
 * 模板狀態指示器
 * 顯示當前選中的模板縮圖和操作按鈕
 */
export function TemplateIndicator() {
  const {
    templateImage,
    templateBox,
    currentTool,
    currentImage,
    confidenceThreshold,
    currentCategoryId,
    categories,
    setTemplateImage,
    setTemplateBox,
    setPreviewMask,
    setLoading,
    setError,
    addAnnotations,
  } = useAnnotationStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // 當模板改變時，生成縮圖
  useEffect(() => {
    if (!templateImage || !templateBox) {
      setThumbnailUrl(null);
      return;
    }

    // 從模板圖片和框選區域生成縮圖
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 計算裁剪區域
      const { x1, y1, x2, y2 } = templateBox;
      const cropWidth = x2 - x1;
      const cropHeight = y2 - y1;

      // 設定縮圖大小（最大 80px）
      const maxSize = 80;
      const scale = Math.min(maxSize / cropWidth, maxSize / cropHeight, 1);
      const thumbWidth = Math.round(cropWidth * scale);
      const thumbHeight = Math.round(cropHeight * scale);

      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      // 繪製裁剪區域
      ctx.drawImage(
        img,
        x1, y1, cropWidth, cropHeight,
        0, 0, thumbWidth, thumbHeight
      );

      setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = templateImage.url;
  }, [templateImage, templateBox]);

  // 清除模板
  const clearTemplate = () => {
    setTemplateImage(null);
    setTemplateBox(null);
  };

  // 套用模板 - 批次偵測並添加所有相似物體（僅支援同圖）
  const applyTemplate = useCallback(async () => {
    if (!currentImage || !templateImage || !templateBox) return;
    if (currentImage.isLocalOnly) {
      setError('請先確保圖片已上傳至後端');
      return;
    }
    
    // 檢查是否同圖
    if (currentImage.id !== templateImage.id) {
      setError('模板功能僅支援同圖檢測。跨圖請使用「文字工具」。');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const results = await segmentWithTemplate(
        currentImage.id,
        templateImage.id,
        templateBox,
        confidenceThreshold
      );

      console.log(`[applyTemplate] 找到 ${results.length} 個相似物體`);

      if (results.length > 0) {
        // 獲取當前類別資訊
        const category = categories.find(c => c.id === currentCategoryId);
        const categoryName = category?.name || 'object';

        // 將所有結果轉換為標註
        const annotationsToAdd = results.map(result => ({
          imageId: currentImage.id,
          categoryId: currentCategoryId,
          categoryName,
          segmentation: result.mask_rle,
          bbox: result.box as [number, number, number, number],
          score: result.score,
          area: result.area,
        }));

        // 批次添加所有標註
        addAnnotations(annotationsToAdd);
        
        // 清除預覽
        setPreviewMask(null);
        
        // 顯示成功訊息
        console.log(`[applyTemplate] 已添加 ${results.length} 個標註`);
      } else {
        setError('未找到相似物體');
        setPreviewMask(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '模板比對失敗');
    } finally {
      setLoading(false);
    }
  }, [currentImage, templateImage, templateBox, confidenceThreshold, currentCategoryId, categories, setLoading, setError, setPreviewMask, addAnnotations]);

  // 只在模板工具啟用時顯示
  if (currentTool !== 'template') {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-200 p-4 flex items-center gap-4">
        {/* 模板狀態 */}
        {templateImage && templateBox ? (
          <>
            {/* 縮圖 */}
            <div className="relative">
              <canvas ref={canvasRef} className="hidden" />
              {thumbnailUrl ? (
                <img 
                  src={thumbnailUrl} 
                  alt="模板縮圖"
                  className="w-16 h-16 object-cover rounded-lg border-2 border-purple-400"
                />
              ) : (
                <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Image size={24} className="text-purple-400" />
                </div>
              )}
              <div className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            </div>

            {/* 資訊 */}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-purple-800">模板已選取</span>
              <span className="text-xs text-purple-600">
                來自: {templateImage.fileName.length > 15 
                  ? templateImage.fileName.slice(0, 15) + '...' 
                  : templateImage.fileName}
              </span>
              <span className="text-xs text-stone-500">
                {Math.round(templateBox.x2 - templateBox.x1)} × {Math.round(templateBox.y2 - templateBox.y1)} px
              </span>
              {/* 跨圖提示 */}
              {currentImage && currentImage.id !== templateImage.id && (
                <span className="text-xs text-amber-600 font-medium">
                  ⚠️ 跨圖檢測請用文字工具
                </span>
              )}
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-2 ml-2">
              {currentImage && currentImage.id === templateImage.id && (
                <button
                  onClick={applyTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all text-sm font-medium"
                  title="套用模板 (Enter)"
                >
                  <Play size={16} />
                  套用
                </button>
              )}
              <button
                onClick={clearTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 transition-all text-sm"
                title="清除模板 (Escape)"
              >
                <X size={16} />
                清除
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 無模板時的提示 */}
            <div className="flex items-center gap-3 text-purple-600">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center border-2 border-dashed border-purple-300">
                <Image size={24} className="text-purple-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">尚未選取模板</span>
                <span className="text-xs text-stone-500">在圖片上框選物體作為範例</span>
              </div>
            </div>
          </>
        )}

        {/* 說明提示 */}
        <div className="border-l border-purple-200 pl-4 ml-2">
          <div className="text-xs text-stone-500 leading-relaxed">
            <p><strong>1.</strong> 框選物體建立模板</p>
            <p><strong>2.</strong> 按 <kbd className="px-1 py-0.5 bg-stone-200 rounded text-xs">Enter</kbd> 搜尋相似物體</p>
            <p className="text-amber-600">⚠️ 僅支援同圖檢測</p>
          </div>
        </div>
      </div>
    </div>
  );
}
