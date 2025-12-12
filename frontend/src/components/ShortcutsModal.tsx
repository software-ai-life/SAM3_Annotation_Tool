import { X, Keyboard } from 'lucide-react';
import { useAnnotationStore } from '../store/annotationStore';
import { SHORTCUTS, formatShortcut } from '../hooks/useKeyboardShortcuts';

export function ShortcutsModal() {
  const { showShortcuts, toggleShortcuts } = useAnnotationStore();

  if (!showShortcuts) {
    return null;
  }

  // 按類別分組快捷鍵
  const shortcutGroups = {
    '工具切換': SHORTCUTS.filter(s => s.action.startsWith('tool-')),
    '編輯操作': SHORTCUTS.filter(s => ['undo', 'redo', 'delete'].includes(s.action)),
    '選擇操作': SHORTCUTS.filter(s => ['select-all', 'deselect-all', 'cancel', 'confirm'].includes(s.action)),
    '類別快選': SHORTCUTS.filter(s => s.action.startsWith('category-')),
    '其他': SHORTCUTS.filter(s => ['save', 'show-shortcuts'].includes(s.action)),
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Keyboard size={20} className="text-indigo-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800">快捷鍵說明</h2>
          </div>
          <button
            onClick={toggleShortcuts}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* 滑鼠操作說明 */}
          <div className="mb-6 p-4 bg-amber-50/50 rounded-xl border border-amber-100">
            <h3 className="text-xs font-semibold text-amber-600 mb-3 uppercase tracking-wider">
              🖱️ 點分割操作說明（P 鍵切換）
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-600">正向點 - 選取物體 🟢</span>
                <kbd className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg">
                  🖱️ 左鍵
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-600">負向點 - 排除區域 🔴</span>
                <kbd className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg">
                  🖱️ 右鍵
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-600">確認分割 ✅</span>
                <kbd className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">
                  Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-600">取消 / 清除點 ❌</span>
                <kbd className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg">
                  Esc
                </kbd>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-700">
                💡 <strong>操作流程：</strong>左鍵點物體 → 右鍵排除不要的區域 → 預覽滿意後按 Enter 確認
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(shortcutGroups).map(([group, shortcuts]) => (
              <div key={group}>
                <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
                  {group}
                </h3>
                <div className="space-y-2 bg-slate-50/50 rounded-xl p-3">
                  {shortcuts.map((shortcut, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-slate-600">{shortcut.description}</span>
                      <kbd className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm">
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <p className="text-sm text-slate-400 text-center">
            按 <kbd className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded-lg shadow-sm">?</kbd> 或 
            <kbd className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded-lg shadow-sm ml-1">Ctrl + /</kbd> 
            隨時查看此說明
          </p>
        </div>
      </div>
    </div>
  );
}
