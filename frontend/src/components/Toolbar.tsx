import { useState, useRef, useEffect } from 'react';
import { 
  MousePointer2, 
  Plus, 
  Square, 
  Type, 
  Copy,
  Download,
  Undo2,
  Redo2,
  Trash2,
  Keyboard,
  Settings,
  Pentagon,
  ChevronDown,
  X,
  Image
} from 'lucide-react';
import { useAnnotationStore } from '../store/annotationStore';
import type { AnnotationTool } from '../types';

export type ExportFormat = 'coco' | 'yolo-seg' | 'yolo-bbox';
export interface ExportOptions {
  format: ExportFormat;
  includeImages: boolean;
}

interface ToolButtonProps {
  tool: AnnotationTool;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  currentTool: AnnotationTool;
  onClick: (tool: AnnotationTool) => void;
}

function ToolButton({ tool, icon, label, shortcut, currentTool, onClick }: ToolButtonProps) {
  const isActive = currentTool === tool;
  
  return (
    <button
      onClick={() => onClick(tool)}
      className={`
        flex flex-col items-center justify-center p-2.5 rounded-xl transition-all
        ${isActive 
          ? 'bg-amber-800 text-amber-50 shadow-lg shadow-amber-200' 
          : 'bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-800'
        }
      `}
      title={`${label} (${shortcut})`}
    >
      {icon}
      <span className="text-xs mt-1 font-medium">{label}</span>
    </button>
  );
}

interface ToolbarProps {
  onExport: (options: ExportOptions) => void;
  onUploadImages?: (files: File[]) => void;
}

export function Toolbar({ onExport, onUploadImages }: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('coco');
  const [includeImages, setIncludeImages] = useState(true);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  
  const {
    currentTool,
    setCurrentTool,
    undo,
    redo,
    deleteSelectedAnnotations,
    selectedAnnotationIds,
    history,
    historyIndex,
    toggleShortcuts,
    confidenceThreshold,
    setConfidenceThreshold
  } = useAnnotationStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const hasSelection = selectedAnnotationIds.length > 0;

  // 點擊外部關閉選單
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportClick = (format: ExportFormat) => {
    setSelectedFormat(format);
    setShowExportMenu(false);
    setShowExportDialog(true);
  };

  const handleConfirmExport = () => {
    setShowExportDialog(false);
    onExport({ format: selectedFormat, includeImages });
  };

  return (
    <>
      {/* 導出設定對話框 - 使用 Portal 效果，放在最外層 */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-stone-800">導出設定</h3>
              <button
                onClick={() => setShowExportDialog(false)}
                className="p-1 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-stone-500" />
              </button>
            </div>
            
            <div className="mb-4">
              <div className="text-sm text-stone-600 mb-2">格式：<span className="font-medium text-stone-800">
                {selectedFormat === 'coco' ? 'COCO Format' : selectedFormat === 'yolo-seg' ? 'YOLO Segmentation' : 'YOLO Detection'}
              </span></div>
            </div>
            
            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-stone-50 border border-stone-200">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  className="w-5 h-5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex items-center gap-2">
                  <Image size={20} className="text-stone-500" />
                  <div>
                    <div className="text-sm font-medium text-stone-800">包含圖片</div>
                    <div className="text-xs text-stone-500">將圖片打包到 ZIP 檔案中</div>
                  </div>
                </div>
              </label>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowExportDialog(false)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmExport}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                導出
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white/90 backdrop-blur-sm border-b border-amber-200/60 p-3 relative z-50">
        <div className="flex items-center gap-4">
          {/* 檔案操作 */}
          <div className="flex items-center gap-2 border-r border-amber-200/60 pr-4">
          {/* 上傳圖片按鈕 */}
          <label className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-indigo-50 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 cursor-pointer">
            <Image size={18} />
            <span className="text-sm font-medium">上傳圖片</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && onUploadImages) {
                  onUploadImages(Array.from(files));
                  e.target.value = ''; // 重置 input 以允許重複上傳相同檔案
                }
              }}
            />
          </label>
          
          {/* 導出下拉選單 */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-stone-700 text-stone-50 rounded-xl hover:bg-stone-800 transition-all shadow-md shadow-stone-300 hover:shadow-lg hover:shadow-stone-400"
              title="導出標註"
            >
              <Download size={18} />
              <span className="text-sm font-medium">導出</span>
              <ChevronDown size={16} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {showExportMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-stone-200 py-1 z-[100] min-w-[180px]">
                <button
                  onClick={() => handleExportClick('coco')}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 flex items-center gap-2"
                >
                  <span className="font-medium">COCO Format</span>
                  <span className="text-stone-400 text-xs">.json</span>
                </button>
                <button
                  onClick={() => handleExportClick('yolo-seg')}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 flex items-center gap-2"
                >
                  <span className="font-medium">YOLO Segmentation</span>
                  <span className="text-stone-400 text-xs">.txt</span>
                </button>
                <button
                  onClick={() => handleExportClick('yolo-bbox')}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 flex items-center gap-2"
                >
                  <span className="font-medium">YOLO Detection</span>
                  <span className="text-stone-400 text-xs">.txt</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SAM3 標註工具 */}
        <div className="flex items-center gap-1 border-r border-amber-200/60 pr-4">
          <ToolButton
            tool="pointer"
            icon={<MousePointer2 size={20} />}
            label="選擇"
            shortcut="V"
            currentTool={currentTool}
            onClick={setCurrentTool}
          />
          <ToolButton
            tool="add-point"
            icon={<Plus size={20} />}
            label="點分割"
            shortcut="左鍵+/右鍵-"
            currentTool={currentTool}
            onClick={setCurrentTool}
          />
          <ToolButton
            tool="box"
            icon={<Square size={20} />}
            label="框選"
            shortcut="B"
            currentTool={currentTool}
            onClick={setCurrentTool}
          />
          <ToolButton
            tool="text"
            icon={<Type size={20} />}
            label="文字"
            shortcut="T"
            currentTool={currentTool}
            onClick={setCurrentTool}
          />
          <ToolButton
            tool="template"
            icon={<Copy size={20} />}
            label="模板"
            shortcut="M"
            currentTool={currentTool}
            onClick={setCurrentTool}
          />
        </div>

        {/* 手動標註工具（非 SAM3） */}
        <div className="flex items-center gap-1 border-r border-amber-200/60 pr-4">
          <span className="text-xs text-stone-400 mr-1">手動:</span>
          <ToolButton
            tool="polygon"
            icon={<Pentagon size={20} />}
            label="多邊形"
            shortcut="P"
            currentTool={currentTool}
            onClick={setCurrentTool}
          />
        </div>

        {/* 編輯操作 */}
        <div className="flex items-center gap-1 border-r border-amber-200/60 pr-4">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-2.5 rounded-xl transition-all ${
              canUndo 
                ? 'hover:bg-stone-200 text-stone-600 hover:text-stone-800' 
                : 'text-stone-300 cursor-not-allowed'
            }`}
            title="撤銷 (Ctrl+Z)"
          >
            <Undo2 size={20} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-2.5 rounded-xl transition-all ${
              canRedo 
                ? 'hover:bg-stone-200 text-stone-600 hover:text-stone-800' 
                : 'text-stone-300 cursor-not-allowed'
            }`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={20} />
          </button>
          <button
            onClick={deleteSelectedAnnotations}
            disabled={!hasSelection}
            className={`p-2.5 rounded-xl transition-all ${
              hasSelection 
                ? 'hover:bg-red-100 text-red-600 hover:text-red-700' 
                : 'text-stone-300 cursor-not-allowed'
            }`}
            title="刪除選中 (Delete)"
          >
            <Trash2 size={20} />
          </button>
        </div>

        {/* 信心閾值 */}
        <div className="flex items-center gap-3 border-r border-amber-200/60 pr-4">
          <Settings size={18} className="text-stone-400" />
          <label className="text-sm text-stone-500 font-medium">閾值:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            className="w-24 accent-amber-700"
          />
          <span className="text-sm text-stone-700 font-medium w-10">
            {(confidenceThreshold * 100).toFixed(0)}%
          </span>
        </div>

        {/* 快捷鍵提示 */}
        <button
          onClick={toggleShortcuts}
          className="p-2.5 rounded-xl hover:bg-stone-200 text-stone-500 hover:text-stone-700 transition-all ml-auto"
          title="快捷鍵說明 (?)"
        >
          <Keyboard size={20} />
        </button>
      </div>
      </div>
    </>
  );
}
