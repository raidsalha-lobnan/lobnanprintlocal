import React from 'react';
import {
  Save,
  Printer,
  Banknote,
  CreditCard,
  PauseCircle,
  Clock,
  Star,
  Ban,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RotateCcw,
  Search,
  FileText,
  Percent,
  PackageSearch,
  Calculator,
  Layers,
  Sparkles,
  Tag,
  Plus,
  ArrowRight,
  ArrowLeft,
  Settings,
  Edit2,
  X,
  Volume2,
  HelpCircle,
  Camera,
  Scan,
  Zap
} from 'lucide-react';
import { PosCustomButton, PosButtonColorScheme } from '../../types/posCustomizer';

interface PosCustomButtonRendererProps {
  button: PosCustomButton;
  isEditMode?: boolean;
  onExecuteAction: (button: PosCustomButton) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

// Icon mapper for dynamic icon lookup
export function renderPosIcon(iconName: string, className: string = 'w-4 h-4') {
  switch (iconName) {
    case 'Save':
      return <Save className={className} />;
    case 'Printer':
      return <Printer className={className} />;
    case 'Banknote':
      return <Banknote className={className} />;
    case 'CreditCard':
      return <CreditCard className={className} />;
    case 'PauseCircle':
      return <PauseCircle className={className} />;
    case 'Clock':
      return <Clock className={className} />;
    case 'Star':
      return <Star className={className} />;
    case 'Ban':
      return <Ban className={className} />;
    case 'SkipBack':
      return <SkipBack className={className} />;
    case 'SkipForward':
      return <SkipForward className={className} />;
    case 'ChevronLeft':
      return <ChevronLeft className={className} />;
    case 'ChevronRight':
      return <ChevronRight className={className} />;
    case 'Trash2':
      return <Trash2 className={className} />;
    case 'RotateCcw':
      return <RotateCcw className={className} />;
    case 'Search':
      return <Search className={className} />;
    case 'FileText':
      return <FileText className={className} />;
    case 'Percent':
      return <Percent className={className} />;
    case 'PackageSearch':
      return <PackageSearch className={className} />;
    case 'Calculator':
      return <Calculator className={className} />;
    case 'Layers':
      return <Layers className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Tag':
      return <Tag className={className} />;
    case 'Volume2':
      return <Volume2 className={className} />;
    case 'Camera':
      return <Camera className={className} />;
    case 'Scan':
      return <Scan className={className} />;
    case 'Zap':
      return <Zap className={className} />;
    case 'Plus':
      return <Plus className={className} />;
    default:
      return <Tag className={className} />;
  }
}

// Get tailwind classes based on color scheme and location
export function getButtonColorClasses(color: PosButtonColorScheme, location: string, isEditMode: boolean = false) {
  if (location === 'top_toolbar') {
    if (color === 'emerald') {
      return 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-950 border border-emerald-300 hover:border-emerald-500 shadow-2xs hover:shadow-xs';
    }
    return 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-blue-400 shadow-2xs hover:shadow-xs';
  }

  // Bottom action bar or quick grid
  switch (color) {
    case 'blue':
      return 'bg-[#1976d2] hover:bg-[#1565c0] text-white border-blue-600';
    case 'emerald':
      return 'bg-[#059669] hover:bg-[#047857] text-white border-emerald-600';
    case 'amber':
      return 'bg-[#d97706] hover:bg-[#b45309] text-white border-amber-600';
    case 'rose':
      return 'bg-[#e11d48] hover:bg-[#be123c] text-white border-rose-600';
    case 'purple':
      return 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white border-purple-600';
    case 'cyan':
      return 'bg-[#0891b2] hover:bg-[#0e7490] text-white border-cyan-600';
    case 'indigo':
      return 'bg-[#2d5f99] hover:bg-[#254f80] text-white border-indigo-700';
    case 'orange':
      return 'bg-[#ea580c] hover:bg-[#c2410c] text-white border-orange-600';
    case 'slate':
    default:
      return 'bg-[#334155] hover:bg-[#1e293b] text-white border-slate-600';
  }
}

export const PosCustomButtonRenderer: React.FC<PosCustomButtonRendererProps> = ({
  button,
  isEditMode = false,
  onExecuteAction,
  onMoveLeft,
  onMoveRight,
  onEdit,
  onDelete,
  canMoveLeft = true,
  canMoveRight = true
}) => {
  const isTopToolbar = button.location === 'top_toolbar';
  const isQuickGrid = button.location === 'quick_grid';

  const colorClasses = getButtonColorClasses(button.colorScheme, button.location, isEditMode);

  return (
    <div className={`relative group ${isEditMode ? 'p-1 border border-dashed border-amber-400/80 rounded-xl bg-amber-500/10' : ''}`}>
      {/* Live In-place Edit Controls Overlay */}
      {isEditMode && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-slate-900/90 text-white rounded-md px-1 py-0.5 shadow-md z-30 scale-90 sm:scale-100">
          {canMoveRight && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onMoveRight?.();
              }}
              title="تحريك لليمين (تقديم)"
              className="p-0.5 hover:bg-blue-600 rounded text-slate-200 hover:text-white cursor-pointer"
            >
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}

          {canMoveLeft && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onMoveLeft?.();
              }}
              title="تحريك لليسار (تأخير)"
              className="p-0.5 hover:bg-blue-600 rounded text-slate-200 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-2.5 h-2.5" />
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onEdit();
              }}
              title="تعديل الزر"
              className="p-0.5 hover:bg-amber-600 rounded text-amber-300 hover:text-white cursor-pointer"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onDelete();
              }}
              title="حذف أو إخفاء الزر"
              className="p-0.5 hover:bg-rose-600 rounded text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* Main Button */}
      <button
        type="button"
        onClick={() => {
          if (!isEditMode) {
            onExecuteAction(button);
          }
        }}
        title={`${button.subLabel || button.label}${button.shortcut ? ` (${button.shortcut})` : ''}`}
        className={`font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
          isTopToolbar
            ? 'px-2.5 py-1 h-8 text-xs rounded-lg shadow-2xs whitespace-nowrap'
            : isQuickGrid
            ? 'px-2.5 py-1.5 text-xs rounded-xl shadow-xs whitespace-nowrap'
            : 'px-2.5 py-1.5 text-xs rounded-xl shadow-xs whitespace-nowrap'
        } ${colorClasses} ${isEditMode ? 'opacity-90 hover:opacity-100 cursor-move' : ''}`}
      >
        {renderPosIcon(
          button.iconName,
          isTopToolbar ? (button.colorScheme === 'emerald' ? 'w-3.5 h-3.5 text-emerald-700' : 'w-3.5 h-3.5 text-blue-600') : 'w-4 h-4'
        )}
        <span>{button.label}</span>
        {button.shortcut && (
          <span className={`text-[9px] font-mono px-1 py-0.2 rounded font-black tracking-tight flex items-center justify-center ${
            isTopToolbar
              ? (button.colorScheme === 'emerald' ? 'bg-emerald-200/70 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-200')
              : 'hidden lg:flex opacity-90 bg-black/20 text-white'
          }`}>
            {button.shortcut.replace(/Enter/ig, '↵')}
          </span>
        )}
      </button>
    </div>
  );
};
