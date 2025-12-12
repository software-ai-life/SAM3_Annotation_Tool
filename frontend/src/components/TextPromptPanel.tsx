import { useState, useEffect } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { useAnnotationStore } from '../store/annotationStore';

interface TextPromptPanelProps {
  onSubmit: (prompt: string) => void;
}

export function TextPromptPanel({ onSubmit }: TextPromptPanelProps) {
  const { textPrompt, setTextPrompt, currentTool, setCurrentTool, isLoading } = useAnnotationStore();
  const [localPrompt, setLocalPrompt] = useState(textPrompt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localPrompt.trim()) {
      setTextPrompt(localPrompt.trim());
      onSubmit(localPrompt.trim());
    }
  };

  const handleClose = () => {
    setLocalPrompt('');
    setTextPrompt('');
    setCurrentTool('pointer'); // 切換到選擇工具來關閉面板
  };

  const handleClear = () => {
    setLocalPrompt('');
    setTextPrompt('');
  };

  // 監聽 Escape 鍵關閉面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentTool === 'text') {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTool]);

  if (currentTool !== 'text') {
    return null;
  }

  return (
    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-10">
      <div className="bg-amber-50/95 backdrop-blur-sm rounded-2xl shadow-xl border border-amber-200/60 p-5 min-w-[420px]">
        {/* 標題列 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-700" />
            <span className="text-sm font-semibold text-stone-700">文字提示</span>
            <span className="text-xs text-stone-400">(描述要分割的物件)</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
            title="關閉 (Esc)"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* 輸入表單 */}
        <form onSubmit={handleSubmit}>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                placeholder="例如：紅色汽車、穿白衣的人、貓咪..."
                className="w-full p-3 pr-10 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all bg-white/80"
                autoFocus
                disabled={isLoading}
              />
              {localPrompt && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500 transition-colors"
                  title="清除文字"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!localPrompt.trim() || isLoading}
              className={`
                flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all
                ${localPrompt.trim() && !isLoading
                  ? 'bg-amber-700 text-amber-50 hover:bg-amber-800 shadow-md shadow-amber-200 hover:shadow-lg'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }
              `}
            >
              <Send size={16} />
              分割
            </button>
          </div>
        </form>
        
        <div className="mt-3 text-xs text-stone-400">
          提示：按 Enter 確認，按 Esc 關閉
        </div>
      </div>
    </div>
  );
}
