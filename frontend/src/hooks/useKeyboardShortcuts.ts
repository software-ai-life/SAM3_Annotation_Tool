import { useEffect, useCallback } from 'react';
import { useAnnotationStore } from '../store/annotationStore';
import type { ShortcutKey } from '../types';

/**
 * 快捷鍵配置
 */
export const SHORTCUTS: ShortcutKey[] = [
  // 工具切換
  { key: 'v', description: '選擇工具', action: 'tool-pointer' },
  { key: '=', description: '增點工具', action: 'tool-add-point' },
  { key: '+', description: '增點工具', action: 'tool-add-point' },
  { key: '-', description: '減點工具', action: 'tool-remove-point' },
  { key: 'b', description: '框選工具', action: 'tool-box' },
  { key: 't', description: '文字提示', action: 'tool-text' },
  { key: 'm', description: '模板比對', action: 'tool-template' },
  
  // 編輯操作
  { key: 'z', ctrlKey: true, description: '撤銷', action: 'undo' },
  { key: 'y', ctrlKey: true, description: '重做', action: 'redo' },
  { key: 'z', ctrlKey: true, shiftKey: true, description: '重做', action: 'redo' },
  { key: 'Delete', description: '刪除選中', action: 'delete' },
  { key: 'Backspace', description: '刪除選中', action: 'delete' },
  
  // 選擇操作
  { key: 'a', ctrlKey: true, description: '全選', action: 'select-all' },
  { key: 'd', ctrlKey: true, description: '取消全選', action: 'deselect-all' },
  { key: 'Escape', description: '取消/清除', action: 'cancel' },
  
  // 確認操作
  { key: 'Enter', description: '確認標註', action: 'confirm' },
  { key: ' ', description: '確認標註', action: 'confirm' },
  
  // 類別快速選擇 (1-9)
  { key: '1', description: '選擇類別 1', action: 'category-1' },
  { key: '2', description: '選擇類別 2', action: 'category-2' },
  { key: '3', description: '選擇類別 3', action: 'category-3' },
  { key: '4', description: '選擇類別 4', action: 'category-4' },
  { key: '5', description: '選擇類別 5', action: 'category-5' },
  { key: '6', description: '選擇類別 6', action: 'category-6' },
  { key: '7', description: '選擇類別 7', action: 'category-7' },
  { key: '8', description: '選擇類別 8', action: 'category-8' },
  { key: '9', description: '選擇類別 9', action: 'category-9' },
  
  // 其他
  { key: 'c', ctrlKey: true, description: '複製選中標註', action: 'copy' },
  { key: 'v', ctrlKey: true, description: '貼上標註', action: 'paste' },
  { key: '?', description: '顯示快捷鍵', action: 'show-shortcuts' },
  { key: '/', ctrlKey: true, description: '顯示快捷鍵', action: 'show-shortcuts' },
];

interface UseKeyboardShortcutsProps {
  onConfirm?: () => void;
}

export function useKeyboardShortcuts({ onConfirm }: UseKeyboardShortcutsProps = {}) {
  const {
    setCurrentTool,
    undo,
    redo,
    deleteSelectedAnnotations,
    selectAll,
    deselectAll,
    clearTempPoints,
    setTempBox,
    setCurrentCategoryId,
    categories,
    toggleShortcuts,
    currentTool,
    copySelectedAnnotations,
    startPasting,
    cancelPaste,
    isPasting
  } = useAnnotationStore();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 忽略輸入框中的快捷鍵
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      // 但允許 Escape 鍵
      if (event.key !== 'Escape') {
        return;
      }
    }

    const { key, ctrlKey, shiftKey, altKey } = event;

    // 工具切換
    if (!ctrlKey && !shiftKey && !altKey) {
      switch (key.toLowerCase()) {
        case 'v':
          setCurrentTool('pointer');
          event.preventDefault();
          return;
        case '=':
        case '+':
          setCurrentTool('add-point');
          event.preventDefault();
          return;
        case '-':
          setCurrentTool('remove-point');
          event.preventDefault();
          return;
        case 'b':
          setCurrentTool('box');
          event.preventDefault();
          return;
        case 't':
          setCurrentTool('text');
          event.preventDefault();
          return;
        case 'm':
          setCurrentTool('template');
          event.preventDefault();
          return;
      }
    }

    // 編輯操作
    if (ctrlKey && !shiftKey && !altKey) {
      switch (key.toLowerCase()) {
        case 'z':
          undo();
          event.preventDefault();
          return;
        case 'y':
          redo();
          event.preventDefault();
          return;
        case 'a':
          selectAll();
          event.preventDefault();
          return;
        case 'd':
          deselectAll();
          event.preventDefault();
          return;
        case 'c':
          copySelectedAnnotations();
          event.preventDefault();
          return;
        case 'v':
          startPasting();
          event.preventDefault();
          return;
        case '/':
          toggleShortcuts();
          event.preventDefault();
          return;
      }
    }

    // Ctrl+Shift+Z = 重做
    if (ctrlKey && shiftKey && key.toLowerCase() === 'z') {
      redo();
      event.preventDefault();
      return;
    }

    // 刪除操作
    if (key === 'Delete' || key === 'Backspace') {
      deleteSelectedAnnotations();
      event.preventDefault();
      return;
    }

    // 取消操作
    if (key === 'Escape') {
      // 如果在貼上模式，先取消貼上
      if (isPasting) {
        cancelPaste();
        event.preventDefault();
        return;
      }
      clearTempPoints();
      setTempBox(null);
      deselectAll();
      event.preventDefault();
      return;
    }

    // 確認操作 - Enter 鍵由 AnnotationCanvas 處理（避免重複觸發）
    // 這裡只處理空白鍵
    if (key === ' ') {
      if (currentTool !== 'pointer') {
        onConfirm?.();
        event.preventDefault();
        return;
      }
    }

    // 類別快速選擇 (1-9)
    if (!ctrlKey && !shiftKey && !altKey) {
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 9) {
        const category = categories[num - 1];
        if (category) {
          setCurrentCategoryId(category.id);
          event.preventDefault();
          return;
        }
      }
    }

    // 顯示快捷鍵
    if (key === '?') {
      toggleShortcuts();
      event.preventDefault();
      return;
    }
  }, [
    setCurrentTool,
    undo,
    redo,
    deleteSelectedAnnotations,
    selectAll,
    deselectAll,
    clearTempPoints,
    setTempBox,
    setCurrentCategoryId,
    categories,
    toggleShortcuts,
    currentTool,
    copySelectedAnnotations,
    startPasting,
    cancelPaste,
    isPasting,
    onConfirm
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * 格式化快捷鍵顯示
 */
export function formatShortcut(shortcut: ShortcutKey): string {
  const parts: string[] = [];
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.altKey) parts.push('Alt');
  
  let key = shortcut.key;
  if (key === ' ') key = 'Space';
  if (key === 'Escape') key = 'Esc';
  if (key === 'Delete') key = 'Del';
  if (key === 'Backspace') key = '⌫';
  
  parts.push(key.toUpperCase());
  return parts.join(' + ');
}
