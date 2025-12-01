import { useState, useRef } from 'react';
import { FolderOpen, RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import type { AutoSaveData } from '../types';

interface RecoveryModalProps {
  autoSaveData: AutoSaveData;
  onRecover: (files: FileList) => void;
  onDiscard: () => void;
}

export function RecoveryModal({ autoSaveData, onRecover, onDiscard }: RecoveryModalProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const savedDate = new Date(autoSaveData.savedAt);
  const formattedDate = savedDate.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleSelectFolder = () => {
    folderInputRef.current?.click();
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsSelecting(true);
      onRecover(files);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* 標題區 */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
          <div className="flex items-center gap-3 text-white">
            <AlertCircle size={24} />
            <h2 className="text-xl font-bold">發現未儲存的工作進度</h2>
          </div>
        </div>

        {/* 內容區 */}
        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-amber-800 text-sm mb-2">
              上次儲存時間：<span className="font-medium">{formattedDate}</span>
            </p>
            <div className="flex gap-4 text-sm text-amber-700">
              <span>📁 {autoSaveData.images.length} 張圖片</span>
              <span>🏷️ {autoSaveData.annotations.length} 個標註</span>
              <span>📂 {autoSaveData.categories.length} 個類別</span>
            </div>
          </div>

          <p className="text-slate-600 text-sm mb-4">
            若要恢復工作進度，請重新選擇<strong>相同的圖片資料夾</strong>，系統會根據檔名自動比對並恢復標註。
          </p>

          {/* 圖片列表預覽 */}
          {autoSaveData.images.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
              <p className="text-xs text-slate-500 mb-2">需要的圖片檔案：</p>
              <div className="flex flex-wrap gap-1">
                {autoSaveData.images.slice(0, 10).map((img, idx) => (
                  <span 
                    key={idx}
                    className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded"
                  >
                    {img.fileName}
                  </span>
                ))}
                {autoSaveData.images.length > 10 && (
                  <span className="text-xs text-slate-500">
                    ...還有 {autoSaveData.images.length - 10} 個
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 隱藏的檔案輸入 */}
          <input
            ref={folderInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            onChange={handleFolderChange}
            className="hidden"
            multiple
            {...{ webkitdirectory: '', directory: '' } as any}
          />

          {/* 按鈕 */}
          <div className="flex gap-3">
            <button
              onClick={handleSelectFolder}
              disabled={isSelecting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSelecting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>恢復中...</span>
                </>
              ) : (
                <>
                  <FolderOpen size={18} />
                  <span>選擇資料夾並恢復</span>
                </>
              )}
            </button>
            <button
              onClick={onDiscard}
              disabled={isSelecting}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all disabled:opacity-50"
              title="捨棄暫存資料"
            >
              <Trash2 size={18} />
              <span>捨棄</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
