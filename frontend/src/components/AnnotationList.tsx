import { useState } from 'react';
import { Eye, EyeOff, Trash2, ChevronDown, ChevronRight, Plus, X, Edit2, Check } from 'lucide-react';
import { useAnnotationStore, COLOR_PALETTE } from '../store/annotationStore';

export function AnnotationList() {
  const {
    annotations,
    currentImage,
    selectedAnnotationIds,
    selectAnnotation,
    toggleAnnotationVisibility,
    deleteAnnotation,
    categories,
    currentCategoryId,
    setCurrentCategoryId,
    addCategory,
    deleteCategory,
    updateCategory
  } = useAnnotationStore();

  // 只顯示當前圖片的標註
  const currentAnnotations = currentImage 
    ? annotations.filter(ann => ann.imageId === currentImage.id)
    : [];

  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_PALETTE[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<number | 'new' | null>(null);

  const toggleCategory = (categoryId: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim(), newCategoryColor);
      setNewCategoryName('');
      setNewCategoryColor(COLOR_PALETTE[0]);
      setIsAddingCategory(false);
      setShowColorPicker(null);
    }
  };

  const handleStartEdit = (cat: { id: number; name: string }) => {
    setEditingCategoryId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveEdit = () => {
    if (editingCategoryId && editingName.trim()) {
      updateCategory(editingCategoryId, { name: editingName.trim() });
      setEditingCategoryId(null);
      setEditingName('');
    }
  };

  const handleDeleteCategory = (id: number) => {
    if (confirm('確定要刪除此類別嗎？相關標註不會被刪除。')) {
      deleteCategory(id);
    }
  };

  const handleColorChange = (catId: number, color: string) => {
    updateCategory(catId, { color });
    setShowColorPicker(null);
  };

  // 按類別分組標註（只顯示當前圖片的）
  const annotationsByCategory = currentAnnotations.reduce((acc, ann) => {
    const catId = ann.categoryId;
    if (!acc[catId]) {
      acc[catId] = [];
    }
    acc[catId].push(ann);
    return acc;
  }, {} as Record<number, typeof currentAnnotations>);

  return (
    <div className="w-72 bg-white/90 backdrop-blur-sm border-l border-amber-200/60 flex flex-col">
      {/* 類別管理區 */}
      <div className="p-4 border-b border-amber-200/60">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-stone-700">
            類別管理
          </label>
          <button
            onClick={() => setIsAddingCategory(true)}
            className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-700 hover:text-amber-800 transition-all"
            title="新增類別"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* 新增類別輸入框 */}
        {isAddingCategory && (
          <div className="mb-3 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setShowColorPicker(showColorPicker === 'new' ? null : 'new')}
                className="p-2 border border-amber-200 rounded-lg hover:bg-stone-50 transition-all"
                title="選擇顏色"
              >
                <div
                  className="w-5 h-5 rounded"
                  style={{ backgroundColor: newCategoryColor }}
                />
              </button>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="輸入類別名稱..."
                className="flex-1 p-2 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') {
                    setIsAddingCategory(false);
                    setNewCategoryName('');
                    setShowColorPicker(null);
                  }
                }}
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="p-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => {
                  setIsAddingCategory(false);
                  setNewCategoryName('');
                  setShowColorPicker(null);
                }}
                className="p-2 hover:bg-stone-200 rounded-lg text-stone-400 hover:text-stone-600 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            {/* 顏色選擇器 */}
            {showColorPicker === 'new' && (
              <div className="p-2 bg-stone-50 rounded-lg border border-stone-200">
                <div className="grid grid-cols-10 gap-1">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setNewCategoryColor(color);
                        setShowColorPicker(null);
                      }}
                      className={`w-5 h-5 rounded transition-all hover:scale-110 ${
                        newCategoryColor === color ? 'ring-2 ring-offset-1 ring-stone-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 類別列表 */}
        {categories.length === 0 ? (
          <div className="text-center py-6 text-stone-400 text-sm">
            <div className="text-2xl mb-2">📁</div>
            尚無類別
            <br />
            <span className="text-xs">點擊 + 新增類別</span>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {categories.map((cat, idx) => (
              <div key={cat.id} className="relative">
                <div
                  className={`
                    group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all
                    ${currentCategoryId === cat.id
                      ? 'bg-amber-100 border border-amber-300'
                      : 'hover:bg-stone-100 border border-transparent'
                    }
                  `}
                  onClick={() => setCurrentCategoryId(cat.id)}
                >
                  {/* 可點擊的顏色圓點 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowColorPicker(showColorPicker === cat.id ? null : cat.id);
                    }}
                    className="w-4 h-4 rounded-full flex-shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-stone-300 transition-all"
                    style={{ backgroundColor: cat.color }}
                    title="點擊修改顏色"
                  />
                
                  {editingCategoryId === cat.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 p-1 text-sm border border-amber-300 rounded focus:outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') {
                          setEditingCategoryId(null);
                          setEditingName('');
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 text-sm text-stone-700 truncate">
                      {idx < 9 && <span className="text-stone-400 mr-1">{idx + 1}</span>}
                      {cat.name}
                    </span>
                  )}

                  {/* 操作按鈕 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingCategoryId === cat.id ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit();
                        }}
                        className="p-1 hover:bg-amber-200 rounded text-amber-700"
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(cat);
                        }}
                        className="p-1 hover:bg-stone-200 rounded text-stone-400"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(cat.id);
                      }}
                      className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                {/* 類別顏色選擇器 */}
                {showColorPicker === cat.id && (
                  <div className="absolute left-0 right-0 mt-1 p-2 bg-white rounded-lg border border-stone-200 shadow-lg z-10">
                    <div className="grid grid-cols-10 gap-1">
                      {COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          onClick={() => handleColorChange(cat.id, color)}
                          className={`w-5 h-5 rounded transition-all hover:scale-110 ${
                            cat.color === color ? 'ring-2 ring-offset-1 ring-stone-400' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 標註列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <h3 className="text-sm font-semibold text-stone-700 mb-3">
            標註列表 <span className="text-stone-400 font-normal">({currentAnnotations.length})</span>
          </h3>
          
          {categories.map(category => {
            const categoryAnnotations = annotationsByCategory[category.id] || [];
            if (categoryAnnotations.length === 0) return null;
            
            const isExpanded = expandedCategories.has(category.id);
            
            return (
              <div key={category.id} className="mb-2">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center gap-2 p-2.5 hover:bg-stone-100 rounded-xl text-left transition-all"
                >
                  {isExpanded ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="flex-1 text-sm font-medium text-stone-700">{category.name}</span>
                  <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                    {categoryAnnotations.length}
                  </span>
                </button>
                
                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {categoryAnnotations.map(ann => (
                      <div
                        key={ann.id}
                        onClick={(e) => {
                          selectAnnotation(ann.id, e.ctrlKey || e.metaKey);
                        }}
                        className={`
                          flex items-center gap-2 p-2.5 rounded-xl cursor-pointer text-sm transition-all
                          ${selectedAnnotationIds.includes(ann.id)
                            ? 'bg-amber-100 border border-amber-300 shadow-sm'
                            : 'hover:bg-stone-100 border border-transparent'
                          }
                        `}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: ann.color }}
                        />
                        <span className="flex-1 truncate text-stone-600">
                          {ann.categoryName} #{ann.id.slice(-4)}
                        </span>
                        <span className="text-xs text-stone-400">
                          {(ann.score * 100).toFixed(0)}%
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAnnotationVisibility(ann.id);
                          }}
                          className="p-1 hover:bg-stone-200 rounded-lg text-stone-400 hover:text-stone-600 transition-all"
                          title={ann.visible ? '隱藏' : '顯示'}
                        >
                          {ann.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAnnotation(ann.id);
                          }}
                          className="p-1 hover:bg-red-50 rounded-lg text-stone-400 hover:text-red-500 transition-all"
                          title="刪除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          
          {currentAnnotations.length === 0 && (
            <div className="text-center text-stone-400 text-sm py-12">
              <div className="text-3xl mb-2">📝</div>
              尚無標註
              <br />
              <span className="text-xs text-stone-300">使用工具開始標註</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
