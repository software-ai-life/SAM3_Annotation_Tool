import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Image, X } from 'lucide-react';
import { useAnnotationStore } from '../store/annotationStore';

export function ImageNavigator() {
  const {
    images,
    currentImage,
    setCurrentImage,
    removeImage,
    annotations
  } = useAnnotationStore();

  // 追蹤已載入完成的圖片
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [errorImages, setErrorImages] = useState<Set<string>>(new Set());

  const handleImageLoad = useCallback((imageId: string) => {
    setLoadedImages(prev => new Set(prev).add(imageId));
  }, []);

  const handleImageError = useCallback((imageId: string) => {
    setErrorImages(prev => new Set(prev).add(imageId));
  }, []);

  if (images.length === 0) return null;

  const currentIndex = currentImage 
    ? images.findIndex(img => img.id === currentImage.id)
    : -1;

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentImage(images[currentIndex - 1]);
    }
  };

  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentImage(images[currentIndex + 1]);
    }
  };

  const getAnnotationCount = (imageId: string) => {
    return annotations.filter(a => a.imageId === imageId).length;
  };

  return (
    <div className="bg-amber-50/80 backdrop-blur-sm border-b border-amber-200/60">
      <div className="flex items-center gap-2 px-4 py-2">
        {/* 導航按鈕 */}
        <button
          onClick={goToPrevious}
          disabled={currentIndex <= 0}
          className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-200 text-stone-600"
        >
          <ChevronLeft size={18} />
        </button>

        {/* 圖片縮圖列表 */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-2 py-1">
            {images.map((img, idx) => {
              const isActive = currentImage?.id === img.id;
              const annotationCount = getAnnotationCount(img.id);
              const isLoaded = loadedImages.has(img.id);
              const hasError = errorImages.has(img.id);
              
              return (
                <div
                  key={img.id}
                  className={`
                    relative group flex-shrink-0 cursor-pointer rounded-lg overflow-hidden transition-all
                    ${isActive 
                      ? 'ring-2 ring-amber-600 ring-offset-2' 
                      : 'hover:ring-2 hover:ring-stone-300 hover:ring-offset-1'
                    }
                  `}
                  onClick={() => setCurrentImage(img)}
                >
                  {/* 載入中的 Skeleton */}
                  {!isLoaded && !hasError && (
                    <div className="absolute inset-0 w-16 h-12 bg-stone-200 animate-pulse flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  
                  {/* 載入錯誤的提示 */}
                  {hasError && (
                    <div className="absolute inset-0 w-16 h-12 bg-red-100 flex items-center justify-center">
                      <X size={16} className="text-red-500" />
                    </div>
                  )}
                  
                  <img
                    src={img.url}
                    alt={img.fileName}
                    className={`
                      w-16 h-12 object-cover transition-opacity duration-300
                      ${isLoaded ? 'opacity-100' : 'opacity-0'}
                    `}
                    onLoad={() => handleImageLoad(img.id)}
                    onError={() => handleImageError(img.id)}
                  />
                  
                  {/* 序號標籤 */}
                  <div className="absolute top-0.5 left-0.5 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </div>
                  
                  {/* 標註數量 */}
                  {annotationCount > 0 && (
                    <div className="absolute bottom-0.5 right-0.5 bg-amber-700 text-white text-xs px-1.5 py-0.5 rounded-full">
                      {annotationCount}
                    </div>
                  )}
                  
                  {/* 刪除按鈕 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(img.id);
                    }}
                    className="absolute top-0.5 right-0.5 bg-red-500/80 text-white p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={goToNext}
          disabled={currentIndex >= images.length - 1}
          className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-200 text-stone-600"
        >
          <ChevronRight size={18} />
        </button>

        {/* 進度指示 */}
        <div className="flex items-center gap-2 pl-3 border-l border-amber-200 text-sm text-stone-500">
          <Image size={16} />
          <span>{currentIndex + 1} / {images.length}</span>
          {/* 載入進度 */}
          {loadedImages.size < images.length && (
            <span className="text-amber-600">
              (載入中 {loadedImages.size}/{images.length})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
