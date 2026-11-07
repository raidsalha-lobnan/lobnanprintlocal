import React, { useState, useRef } from 'react';
import { LineAttachment, InvoiceItem } from '../../types';
import {
  X,
  Download,
  FileText,
  Upload,
  ShieldCheck,
  FileCheck,
  Eye,
  Trash2,
  AlertCircle,
  File,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { posSound } from '../../utils/audio';
import { getBinaryAttachment, downloadBlobFile, saveBinaryAttachment } from '../../utils/fileStorage';
import { resizeAndCompressImage } from '../../utils/imageCompress';
import { uploadFileToGoogleDrive, getSavedDriveToken } from '../../services/googleDriveService';

interface WorkshopAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: string;
  item: InvoiceItem | null;
  itemIndex: number;
  currentUserName: string;
  onAddAttachment: (itemIndex: number, attachment: LineAttachment) => void;
  onRemoveAttachment: (itemIndex: number, attachmentId: string) => { success: boolean; message?: string };
}

export const WorkshopAttachmentModal: React.FC<WorkshopAttachmentModalProps> = ({
  isOpen,
  onClose,
  invoiceNumber,
  item,
  itemIndex,
  currentUserName,
  onAddAttachment,
  onRemoveAttachment
}) => {
  const [selectedPreview, setSelectedPreview] = useState<LineAttachment | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !item) return null;

  const attachments: LineAttachment[] = item.attachments || [];

  // Active preview defaults to the first attachment if available
  const activeAttachment = selectedPreview || (attachments.length > 0 ? attachments[0] : null);

  const handleDownload = async (att: LineAttachment) => {
    posSound.click();

    // 1. Check local lossless binary storage first
    if (att.localBlobId) {
      const stored = await getBinaryAttachment(att.localBlobId);
      if (stored?.blob) {
        downloadBlobFile(stored.blob, att.name);
        return;
      }
    }

    // 2. Check Google Drive link
    if (att.driveDownloadLink || att.driveWebViewLink) {
      window.open(att.driveDownloadLink || att.driveWebViewLink, '_blank');
      return;
    }

    // 3. Check dataUrl
    if (att.data) {
      const link = document.createElement('a');
      link.href = att.data;
      link.download = att.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 4. Fallback info file
    const sampleBlob = new Blob([`ملف أمر طباعة رقم: ${invoiceNumber}\nاسم الصنف: ${item.itemName}\nاسم الملف: ${att.name}\nتاريخ الرفع: ${att.uploadedAt || 'غير محدد'}\nبواسطة: ${att.uploadedBy || 'المستخدم'}`], {
      type: att.type || 'text/plain;charset=utf-8'
    });
    downloadBlobFile(sampleBlob, att.name);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const attId = 'att-rev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const now = new Date();

    // Save locally to high fidelity binary DB
    await saveBinaryAttachment(attId, file, file.name, file.type);

    let previewDataUrl: string | undefined = undefined;
    if (file.type.startsWith('image/')) {
      try {
        previewDataUrl = await resizeAndCompressImage(file, 800, 800, 0.75);
      } catch {
        previewDataUrl = await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (ev) => res(ev.target?.result as string);
          reader.onerror = () => res(undefined);
          reader.readAsDataURL(file);
        });
      }
    }

    const newAtt: LineAttachment = {
      id: attId,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      data: previewDataUrl,
      localBlobId: attId,
      storageType: 'local',
      uploadedAt: now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }),
      isOriginal: false, // نسخة معدلة وليست أصلية
      uploadedBy: currentUserName || 'فني الورشة'
    };

    // If Google Drive token exists, upload in background
    if (getSavedDriveToken()) {
      uploadFileToGoogleDrive(file, file.name)
        .then((res) => {
          newAtt.driveFileId = res.fileId;
          newAtt.driveWebViewLink = res.webViewLink;
          newAtt.driveDownloadLink = res.webContentLink;
          newAtt.storageType = 'drive';
        })
        .catch((err) => console.warn('Drive upload error:', err));
    }

    onAddAttachment(itemIndex, newAtt);
    setSelectedPreview(newAtt);
    posSound.beep();
    setFeedbackMsg({
      type: 'success',
      text: `تم إرفاق النسخة المعدلة "${file.name}" بجودة أصلية 100% بنجاح`
    });
    setTimeout(() => setFeedbackMsg(null), 4000);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = (att: LineAttachment) => {
    const confirmed = window.confirm(`هل أنت متأكد من حذف المرفق "${att.name}"؟`);
    if (!confirmed) return;

    const res = onRemoveAttachment(itemIndex, att.id);
    if (res.success) {
      posSound.click();
      setFeedbackMsg({
        type: 'success',
        text: 'تم حذف المرفق بنجاح'
      });
      if (selectedPreview?.id === att.id) {
        setSelectedPreview(null);
      }
      setTimeout(() => setFeedbackMsg(null), 3000);
    } else {
      posSound.error();
      setFeedbackMsg({
        type: 'error',
        text: res.message || 'فشل حذف المرفق'
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'غير محدد';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">إدارة وتنزيل ملفات البند</h3>
                <span className="bg-blue-900/80 text-blue-200 border border-blue-700/60 text-xs px-2 py-0.5 rounded font-mono font-semibold">
                  فاتورة {invoiceNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-lg">
                الصنف: <strong className="text-slate-200">{item.itemName}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedbackMsg.text}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Left Column: Attachment List & Upload */}
          <div className="md:col-span-5 space-y-4 flex flex-col">
            {/* Upload revised attachment trigger */}
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                id="revised-file-input"
                onChange={handleFileUpload}
              />
              <label
                htmlFor="revised-file-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">
                  إعادة إرفاق / رفع ملف معدل
                </span>
                <span className="text-[10px] text-slate-400 font-light">
                  (بروفة جديدة، تصحيح قياسات، أو تعديل تصميم)
                </span>
              </label>
            </div>

            {/* List of Attachments */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">
                  قائمة المرفقات ({attachments.length}):
                </span>
                <span className="text-[10px] text-slate-400 font-light">
                  انقر على الملف للمعاينة والتنزيل
                </span>
              </div>

              {attachments.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
                  <p className="text-xs">لا توجد ملفات مرفقة بهذا البند حالياً</p>
                  <p className="text-[11px] mt-1 text-slate-500">يمكنك رفع بروفة أو نسخة معدلة من الزر أعلاه</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[340px] overflow-y-auto pr-0.5">
                  {/* Original Attachments */}
                  {attachments.filter(a => a.isOriginal !== false).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Lock className="w-3 h-3"/> المرفقات الأصلية</h4>
                      {attachments.filter(a => a.isOriginal !== false).map((att) => {
                        const isSelected = activeAttachment?.id === att.id;
                        return (
                          <div
                            key={att.id}
                            onClick={() => setSelectedPreview(att)}
                            className={`p-2.5 rounded-lg border text-right cursor-pointer transition-all ${
                              isSelected ? 'bg-amber-50/80 border-amber-400 ring-1 ring-amber-300' : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-xs bg-amber-100 text-amber-800">
                                    <File className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="truncate">
                                    <p className="text-xs font-bold text-slate-800 truncate" title={att.name}>{att.name}</p>
                                    <p className="text-[9px] text-slate-400 font-light">{formatFileSize(att.size)} • {att.uploadedAt || 'تاريخ غير محدد'}</p>
                                  </div>
                                </div>
                                <span className="shrink-0 text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /><span>أصلي محمي</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-100">
                                <span className="text-slate-500 truncate">بواسطة: {att.uploadedByUserName || att.uploadedBy || 'المستخدم'}</span>
                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => handleDownload(att)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="تنزيل الملف"><Download className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* New Attachments */}
                  {attachments.filter(a => a.isOriginal === false).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-sky-600 mb-1 flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3"/> مرفقات جديدة</h4>
                      {attachments.filter(a => a.isOriginal === false).map((att) => {
                        const isSelected = activeAttachment?.id === att.id;
                        return (
                          <div
                            key={att.id}
                            onClick={() => setSelectedPreview(att)}
                            className={`p-2.5 rounded-lg border text-right cursor-pointer transition-all ${
                              isSelected ? 'bg-sky-50/80 border-sky-400 ring-1 ring-sky-300' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
                            }`}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-xs bg-emerald-100 text-emerald-800">
                                    <File className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="truncate">
                                    <p className="text-xs font-bold text-slate-800 truncate" title={att.name}>{att.name}</p>
                                    <p className="text-[9px] text-slate-400 font-light">{formatFileSize(att.size)} • {att.uploadedAt || 'تاريخ غير محدد'}</p>
                                  </div>
                                </div>
                                <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  مرفق جديد
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] pt-2 border-t border-emerald-200/50">
                                <span className="text-emerald-700 font-semibold truncate">تم الإرفاق بواسطة: {att.uploadedByUserName || att.uploadedBy || 'المستخدم'}</span>
                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => handleDownload(att)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="تنزيل الملف"><Download className="w-3.5 h-3.5" /></button>
                                  <button type="button" onClick={() => handleDelete(att)} className="p-1 text-rose-500 hover:bg-rose-100 rounded" title="حذف النسخة المعدلة"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Active File Preview & Actions */}
          <div className="md:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-slate-500" />
                <span>معاينة وتفاصيل الملف</span>
              </span>

              {activeAttachment && (
                <button
                  type="button"
                  onClick={() => handleDownload(activeAttachment)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل الملف المرفق</span>
                </button>
              )}
            </div>

            {activeAttachment ? (
              <div className="flex-1 flex flex-col justify-between pt-4 space-y-4">
                {/* Visual View Area */}
                <div className="flex-1 min-h-[220px] bg-white border border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center text-center overflow-hidden">
                  {activeAttachment.data && activeAttachment.data.startsWith('data:image') ? (
                    <img
                      src={activeAttachment.data}
                      alt={activeAttachment.name}
                      className="max-h-[240px] w-auto object-contain rounded shadow-xs"
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                        <FileText className="w-8 h-8" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 break-all max-w-sm px-2">
                        {activeAttachment.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-light">
                        {activeAttachment.type || 'ملف رقمي'} • {formatFileSize(activeAttachment.size)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Metadata Card */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs text-slate-700">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">نوع المستند:</span>
                    <strong className="text-slate-800 font-mono">
                      {activeAttachment.type || 'غير مصنف'}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">حالة المرفق:</span>
                    {activeAttachment.isOriginal !== false ? (
                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>مرفق أصلي محمي (لا يمكن حذفه)</span>
                      </span>
                    ) : (
                      <span className="text-blue-800 bg-blue-100 px-2 py-0.5 rounded font-bold text-[11px]">
                        نسخة معدلة / بروفة فنية
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">تاريخ ووقت الرفع:</span>
                    <span className="text-slate-700 font-mono">{activeAttachment.uploadedAt || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">اسم رافع الملف:</span>
                    <strong className="text-slate-800">{activeAttachment.uploadedBy || 'المستخدم'}</strong>
                  </div>
                </div>

                {/* Bottom Notice on Protection */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>سياسة حفظ الملفات الأصلية:</strong> المرفقات الأصلية المعتمدة لا يمكن حذفها نهائياً لضمان سلامة الأرشيف، بينما يحق للفني إضافة نسخ معدلة ومتابعة تطور التصاميم.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <FileText className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-sm font-semibold">لم يتم تحديد أي ملف للمعاينة</p>
                <p className="text-xs text-slate-400 mt-1">اختر ملفاً من القائمة الجانبية أو قم برفع نسخة معدلة جديدة</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            الصنف: <strong className="text-slate-800">{item.itemName}</strong> ({item.quantity} {item.unit || 'قطعة'})
          </span>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
