import { Cloud, CloudOff, Loader2 } from 'lucide-react';

interface AutoSaveIndicatorProps {
  lastSavedAt: Date | null;
  isSaving: boolean;
}

export function AutoSaveIndicator({ lastSavedAt, isSaving }: AutoSaveIndicatorProps) {
  // 如果從未儲存過，不顯示
  if (!lastSavedAt && !isSaving) {
    return null;
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-30">
      <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-sm">
        {isSaving ? (
          <>
            <Loader2 size={14} className="text-amber-500 animate-spin" />
            <span className="text-slate-600">暫存中...</span>
          </>
        ) : lastSavedAt ? (
          <>
            <Cloud size={14} className="text-emerald-500" />
            <span className="text-slate-500">
              已自動暫存 {formatTime(lastSavedAt)}
            </span>
          </>
        ) : (
          <>
            <CloudOff size={14} className="text-slate-400" />
            <span className="text-slate-400">尚未暫存</span>
          </>
        )}
      </div>
    </div>
  );
}
