import { 
  MousePointer2, 
  Plus, 
  Square, 
  Type, 
  Copy,
  Download,
  Upload,
  FolderOpen,
  Undo2,
  Redo2,
  Trash2,
  Keyboard,
  Settings,
  Pentagon
} from 'lucide-react';
import { useAnnotationStore } from '../store/annotationStore';
import type { AnnotationTool } from '../types';

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
  onUpload: () => void;
  onFolderUpload: () => void;
  onExport: () => void;
}

export function Toolbar({ onUpload, onFolderUpload, onExport }: ToolbarProps) {
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

  return (
    <div className="bg-white/90 backdrop-blur-sm border-b border-amber-200/60 p-3">
      <div className="flex items-center gap-4">
        {/* 檔案操作 */}
        <div className="flex items-center gap-2 border-r border-amber-200/60 pr-4">
          <button
            onClick={onUpload}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-700 text-amber-50 rounded-xl hover:bg-amber-800 transition-all shadow-md shadow-amber-200 hover:shadow-lg hover:shadow-amber-300"
            title="上傳圖片"
          >
            <Upload size={18} />
            <span className="text-sm font-medium">上傳</span>
          </button>
          <button
            onClick={onFolderUpload}
            className="flex items-center gap-2 px-4 py-2.5 bg-stone-600 text-stone-50 rounded-xl hover:bg-stone-700 transition-all shadow-md shadow-stone-200 hover:shadow-lg hover:shadow-stone-300"
            title="上傳資料夾"
          >
            <FolderOpen size={18} />
            <span className="text-sm font-medium">資料夾</span>
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-stone-700 text-stone-50 rounded-xl hover:bg-stone-800 transition-all shadow-md shadow-stone-300 hover:shadow-lg hover:shadow-stone-400"
            title="導出 COCO JSON"
          >
            <Download size={18} />
            <span className="text-sm font-medium">導出</span>
          </button>
        </div>

        {/* 標註工具 */}
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
  );
}
