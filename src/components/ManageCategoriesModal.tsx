import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Check, Save } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { CategoryDefinition, ItemCategory } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageCategoriesModal({ isOpen, onClose }: Props) {
  const { settings, updateSettings, inventory } = useAccounting();
  
  const currentCategories = settings.categories || [];
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<CategoryDefinition>>({});

  if (!isOpen) return null;

  const handleAdd = () => {
    const newId = 'cat_' + Date.now();
    const newCat: CategoryDefinition = {
      id: newId as any,
      name: 'تصنيف جديد',
      nameEn: 'New Category',
      prefix: 'CAT',
      description: '',
      defaultUnit: 'حبة',
      color: 'bg-slate-50 text-slate-700'
    };
    
    updateSettings({
      ...settings,
      categories: [...currentCategories, newCat]
    });
    setEditingId(newId);
    setEditData(newCat);
  };

  const handleSave = () => {
    if (!editingId) return;
    
    updateSettings({
      ...settings,
      categories: currentCategories.map(c => c.id === editingId ? { ...c, ...editData } as CategoryDefinition : c)
    });
    
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const isUsed = inventory.some(item => item.category === id);
    if (isUsed) {
      alert('لا يمكن حذف هذا التصنيف لارتباطه بأصناف مسجلة.');
      return;
    }
    
    if (window.confirm('هل أنت متأكد من حذف التصنيف؟')) {
      updateSettings({
        ...settings,
        categories: currentCategories.filter(c => c.id !== id)
      });
    }
  };

  const allCategories = currentCategories;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">إدارة التصنيفات المخزنية</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">التصنيفات المُضافة تظهر كخيارات عند إضافة صنف جديد.</p>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة تصنيف جديد</span>
            </button>
          </div>

          <div className="space-y-3">
            {allCategories.map(cat => {
              const isEditing = editingId === cat.id;

              return (
                <div key={cat.id} className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2 bg-white">
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">اسم التصنيف</label>
                        <input
                          type="text"
                          value={editData.name || ''}
                          onChange={e => setEditData({...editData, name: e.target.value})}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">البادئة (Prefix)</label>
                        <input
                          type="text"
                          value={editData.prefix || ''}
                          onChange={e => setEditData({...editData, prefix: e.target.value.toUpperCase()})}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                          maxLength={4}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">الوحدة الافتراضية</label>
                        <input
                          type="text"
                          value={editData.defaultUnit || ''}
                          onChange={e => setEditData({...editData, defaultUnit: e.target.value})}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex items-end justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleSave}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700"
                        >
                          <Save className="w-3.5 h-3.5" /> حفظ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cat.color || 'bg-slate-100 text-slate-700'}`}>
                          {cat.prefix}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">{cat.name}</h3>
                          {cat.description && <p className="text-[10px] text-slate-400 font-light">{cat.description}</p>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingId(cat.id); setEditData(cat); }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
