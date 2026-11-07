import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Printer,
  Barcode as BarcodeIcon,
  QrCode,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Tag,
  Sliders,
  Layers,
  FileText
} from 'lucide-react';
import { InventoryItem, BarcodeFormat } from '../types';
import { useAccounting } from '../context/AccountingContext';
import {
  CATEGORY_DEFINITIONS,
  LABEL_PRESETS,
  LabelPreset,
  renderBarcodeToSvg,
  generateQrDataUrl,
  generateValidEan13,
  calculateEan13Checksum,
  getAllItemBarcodes
} from '../utils/barcodeGenerator';
import { posSound } from '../utils/audio';

interface BarcodeBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: InventoryItem | null;
}

export const BarcodeBankModal: React.FC<BarcodeBankModalProps> = ({
  isOpen,
  onClose,
  initialItem
}) => {
  const { inventory, updateInventoryItem, settings } = useAccounting();

  // Selected item
  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialItem?.id || (inventory[0]?.id || '')
  );
  const selectedItem = inventory.find(it => it.id === selectedItemId) || inventory[0];

  // Barcode format & value
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>(
    selectedItem?.barcodeType || (selectedItem?.barcode?.length === 13 && /^\d+$/.test(selectedItem.barcode) ? 'EAN13' : 'CODE128')
  );
  const [barcodeValue, setBarcodeValue] = useState<string>(selectedItem?.barcode || selectedItem?.code || '');

  // Label configuration
  const [selectedPresetId, setSelectedPresetId] = useState<string>('thermal_50x30');
  const selectedPreset = LABEL_PRESETS.find(p => p.id === selectedPresetId) || LABEL_PRESETS[0];

  const [printCopies, setPrintCopies] = useState<number>(1);
  const [showBusinessName, setShowBusinessName] = useState<boolean>(true);
  const [showItemName, setShowItemName] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showItemCode, setShowItemCode] = useState<boolean>(true);
  const [showDate, setShowDate] = useState<boolean>(false);

  // QR Code preview data URL
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // SVG ref for barcode preview
  const svgRef = useRef<SVGSVGElement | null>(null);

  // All barcodes registered for this item (primary + multi-barcodes)
  const allItemBarcodes = useMemo(() => {
    return selectedItem ? getAllItemBarcodes(selectedItem) : [];
  }, [selectedItem]);

  // When initialItem or selectedItemId changes, sync barcode value and format
  useEffect(() => {
    if (selectedItem) {
      const isEan = selectedItem.barcode && selectedItem.barcode.length === 13 && /^\d+$/.test(selectedItem.barcode);
      const fmt: BarcodeFormat = selectedItem.barcodeType || (isEan ? 'EAN13' : 'CODE128');
      setBarcodeFormat(fmt);
      setBarcodeValue(selectedItem.barcode || selectedItem.code);
    }
  }, [selectedItemId]);

  // Render barcode or QR Code whenever format or value changes
  useEffect(() => {
    if (!barcodeValue) return;

    if (barcodeFormat === 'QR') {
      generateQrDataUrl(barcodeValue, { width: 180 }).then(url => {
        setQrDataUrl(url);
      });
    } else if (svgRef.current) {
      renderBarcodeToSvg(svgRef.current, barcodeValue, barcodeFormat as 'CODE128' | 'EAN13', {
        width: 1.8,
        height: 48,
        displayValue: true,
        fontSize: 12,
        margin: 4
      });
    }
  }, [barcodeValue, barcodeFormat]);

  if (!isOpen) return null;

  // Handle generating new code
  const handleGenerateCode = (fmt: BarcodeFormat) => {
    setBarcodeFormat(fmt);
    if (fmt === 'EAN13') {
      const newEan = generateValidEan13('628');
      setBarcodeValue(newEan);
    } else if (fmt === 'QR') {
      setBarcodeValue(selectedItem ? `${selectedItem.code}|${selectedItem.name}|${selectedItem.sellingPrice}` : `ITEM-${Date.now()}`);
    } else {
      // CODE128
      setBarcodeValue(selectedItem?.code || `ITM-${Date.now().toString().slice(-6)}`);
    }
    posSound.playSuccessBeep();
  };

  // Save generated barcode to the item
  const handleSaveToItem = () => {
    if (!selectedItem) return;
    updateInventoryItem(selectedItem.id, {
      barcode: barcodeValue,
      barcodeType: barcodeFormat
    });
    setSaveSuccess(true);
    posSound.playSuccessBeep();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Copy barcode to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(barcodeValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Direct print labels
  const handlePrint = () => {
    posSound.playCashDrawer();
    window.print();
  };

  const currencySymbol = settings.currency || '₪';
  const categoryDef = selectedItem ? CATEGORY_DEFINITIONS[selectedItem.category] : null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      {/* Printable Area - Styles applied specifically for print */}
      <div className="print-only hidden print:block">
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden !important;
              }
              .print-only, .print-only * {
                visibility: visible !important;
              }
              .print-only {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                display: block !important;
              }
              @page {
                size: ${selectedPreset.isRoll ? `${selectedPreset.widthMm}mm ${selectedPreset.heightMm}mm` : 'A4'};
                margin: ${selectedPreset.isRoll ? '2mm' : '8mm'};
              }
              .barcode-label {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }
          `
        }} />

        <div className={selectedPreset.isRoll ? 'flex flex-col items-center' : 'grid grid-cols-3 gap-2'}>
          {Array.from({ length: printCopies }).map((_, idx) => (
            <div
              key={idx}
              className="barcode-label border border-dashed border-gray-400 p-2 text-center flex flex-col items-center justify-center bg-white text-black"
              style={{
                width: `${selectedPreset.widthMm}mm`,
                height: `${selectedPreset.heightMm}mm`,
                overflow: 'hidden'
              }}
            >
              {showBusinessName && (
                <div className="text-[9px] font-bold tracking-tight text-gray-800 leading-none truncate max-w-full">
                  {settings.businessName}
                </div>
              )}
              {showItemName && (
                <div className="text-[11px] font-black text-gray-900 leading-tight mt-0.5 truncate max-w-full">
                  {selectedItem?.name}
                </div>
              )}

              {/* Barcode Graphic */}
              <div className="my-1 flex items-center justify-center max-w-full">
                {barcodeFormat === 'QR' && qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="w-16 h-16 object-contain" />
                ) : (
                  <svg
                    ref={idx === 0 ? svgRef : undefined}
                    className="max-w-full h-auto"
                    style={{ maxHeight: `${selectedPreset.heightMm * 0.45}mm` }}
                  />
                )}
              </div>

              {/* Price & Code */}
              <div className="flex items-center justify-between w-full px-1 text-[10px] font-bold border-t border-gray-300 pt-0.5 mt-auto">
                {showItemCode && <span className="font-mono text-gray-600">{selectedItem?.code}</span>}
                {showPrice && (
                  <span className="text-gray-900 text-[12px] font-extrabold">
                    {selectedItem?.sellingPrice?.toFixed(2)} {currencySymbol}
                  </span>
                )}
              </div>
              {showDate && (
                <div className="text-[8px] text-gray-400 text-left w-full mt-0.5">
                  {new Date().toISOString().split('T')[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal Container */}
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <BarcodeIcon className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
                بنك الباركود والـ QR Code
                <span className="text-xs font-bold px-2 py-0.5 bg-yellow-400 text-slate-950 rounded-full">
                  توليد وطباعة الملصقات
                </span>
              </h2>
              <p className="text-xs text-indigo-100 mt-0.5">
                توليد معايير EAN-13 و CODE-128 والـ QR مع خيارات المقاسات للطابعات الحرارية وصفحات A4
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Item Selector & Category Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-blue-600" />
                اختر الصنف المراد توليد أو طباعة باركود له:
              </label>
              <select
                value={selectedItemId}
                onChange={e => setSelectedItemId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>
                    [{item.code}] - {item.name} ({item.sellingPrice} {currencySymbol})
                  </option>
                ))}
              </select>
            </div>

            {/* Category badge */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">التصنيف المخزني:</div>
              <div className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                {categoryDef?.name || 'عام'}
              </div>
              <div className="text-[10px] text-slate-400 font-light font-mono mt-0.5">
                البادئة: <span className="font-bold text-slate-700 dark:text-slate-300">{categoryDef?.prefix || 'ITEM'}</span>
              </div>
            </div>
          </div>

          {/* Multi-Barcode Selector for this Item */}
          {allItemBarcodes.length > 1 && (
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                  <BarcodeIcon className="w-4 h-4 text-sky-600" />
                  <span>الباركودات المسجلة لهذا الصنف (اختر الباركود للطباعة أو المعاينة):</span>
                </span>
                <span className="text-[10px] font-bold bg-sky-200/70 text-sky-800 px-2 py-0.5 rounded-full">
                  {allItemBarcodes.length} باركودات مسجلة
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {allItemBarcodes.map((b, idx) => {
                  const isSelected = barcodeValue === b.barcode;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setBarcodeValue(b.barcode);
                        if (b.type) {
                          setBarcodeFormat(b.type);
                        } else if (b.barcode.length === 13 && /^\d+$/.test(b.barcode)) {
                          setBarcodeFormat('EAN13');
                        } else {
                          setBarcodeFormat('CODE128');
                        }
                        posSound.playSuccessBeep();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-300'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-sans text-[11px] opacity-80">{b.label}:</span>
                      <span>{b.barcode}</span>
                      {b.isPrimary && (
                        <span className="text-[10px] bg-amber-400 text-slate-900 px-1 rounded font-sans font-bold">
                          رئيسي
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Barcode Type Selector & Quick Generate Buttons */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600" />
                نوع ومعيار الباركود:
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleGenerateCode('CODE128')}
                  className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg flex items-center gap-1 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  توليد CODE-128
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateCode('EAN13')}
                  className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg flex items-center gap-1 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  توليد EAN-13 دولي
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateCode('QR')}
                  className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg flex items-center gap-1 transition"
                >
                  <QrCode className="w-3.5 h-3.5 text-purple-500" />
                  توليد QR Code
                </button>
              </div>
            </div>

            {/* Type buttons */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setBarcodeFormat('CODE128')}
                className={`p-3 rounded-xl border text-center transition ${
                  barcodeFormat === 'CODE128'
                    ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="font-black text-sm">CODE-128</div>
                <div className="text-[11px] opacity-75 mt-0.5">يدعم الحروف والأرقام والشرطات</div>
              </button>

              <button
                type="button"
                onClick={() => setBarcodeFormat('EAN13')}
                className={`p-3 rounded-xl border text-center transition ${
                  barcodeFormat === 'EAN13'
                    ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="font-black text-sm">EAN-13 (دولي)</div>
                <div className="text-[11px] opacity-75 mt-0.5">13 رقم مع الحساب التلقائي للتدقيق</div>
              </button>

              <button
                type="button"
                onClick={() => setBarcodeFormat('QR')}
                className={`p-3 rounded-xl border text-center transition ${
                  barcodeFormat === 'QR'
                    ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="font-black text-sm">QR Code (ثنائي الأبعاد)</div>
                <div className="text-[11px] opacity-75 mt-0.5">مسح فوري بالكاميرات والجوالات</div>
              </button>
            </div>

            {/* Input Value Bar */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={barcodeValue}
                onChange={e => setBarcodeValue(e.target.value)}
                placeholder="أدخل كود أو رقم الباركود..."
                className="flex-1 px-3.5 py-2 text-sm font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition"
                title="نسخ الكود"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'تم النسخ' : 'نسخ'}
              </button>
              <button
                type="button"
                onClick={handleSaveToItem}
                className="px-3.5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-1.5 transition"
                title="حفظ الباركود كرمز رئيسي لهذا الصنف"
              >
                {saveSuccess ? <Check className="w-4 h-4 text-yellow-300" /> : <RefreshCw className="w-4 h-4" />}
                {saveSuccess ? 'تم الحفظ بالصنف!' : 'حفظ بالصنف'}
              </button>
            </div>
          </div>

          {/* Live Preview Card & Print Customization Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Live Preview Box */}
            <div className="md:col-span-6 bg-slate-100 dark:bg-slate-800/70 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 w-full text-center">
                معاينة الملصق المباشرة ({selectedPreset.nameEn}):
              </div>

              {/* Label Simulator */}
              <div
                className="bg-white text-slate-900 rounded-lg shadow-md border border-slate-300 p-3 text-center flex flex-col items-center justify-between w-64 h-40 max-w-full"
                style={{ aspectRatio: `${selectedPreset.widthMm} / ${selectedPreset.heightMm}` }}
              >
                {showBusinessName && (
                  <div className="text-[10px] font-bold text-slate-700 truncate max-w-full">
                    {settings.businessName}
                  </div>
                )}
                {showItemName && (
                  <div className="text-xs font-black text-slate-900 truncate max-w-full mt-0.5">
                    {selectedItem?.name}
                  </div>
                )}

                {/* Graphic */}
                <div className="my-auto flex items-center justify-center w-full">
                  {barcodeFormat === 'QR' && qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code" className="w-20 h-20 object-contain" />
                  ) : (
                    <svg ref={svgRef} className="max-w-full h-auto" />
                  )}
                </div>

                <div className="flex items-center justify-between w-full text-[10px] font-bold border-t border-slate-200 pt-1">
                  {showItemCode && <span className="font-mono text-slate-500">{selectedItem?.code}</span>}
                  {showPrice && (
                    <span className="text-sm font-black text-slate-900">
                      {selectedItem?.sellingPrice?.toFixed(2)} {currencySymbol}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Print Customization Controls */}
            <div className="md:col-span-6 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  مقاس وقالب ملصق الباركود:
                </label>
                <select
                  value={selectedPresetId}
                  onChange={e => setSelectedPresetId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  {LABEL_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Number of copies */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  عدد النسخ المراد طباعتها:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={printCopies}
                    onChange={e => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-1.5 text-sm font-black rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center"
                  />
                  <div className="flex gap-1.5">
                    {[1, 5, 10, 24].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPrintCopies(num)}
                        className={`px-2 py-1 text-xs font-bold rounded-md border ${
                          printCopies === num
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Toggle printable fields */}
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">البيانات الظاهرة على الملصق:</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBusinessName}
                      onChange={e => setShowBusinessName(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    اسم المطبعة / المنشأة
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showItemName}
                      onChange={e => setShowItemName(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    اسم الصنف
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={e => setShowPrice(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    السعر مع رمز العملة ({currencySymbol})
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showItemCode}
                      onChange={e => setShowItemCode(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    كود الصنف (SKU)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDate}
                      onChange={e => setShowDate(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    تاريخ الطباعة
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[10px] text-slate-400 font-light dark:text-slate-400">
            جاهز للطباعة على طابعات الباركود الحرارية (Xprinter, Zebra, Bixolon) أو طابعات A4 الليزرية
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center gap-2 transition"
            >
              <Printer className="w-4 h-4" />
              طباعة الملصقات ({printCopies} {printCopies === 1 ? 'ملصق' : 'ملصقات'})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
