import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Paperclip,
  FileText,
  Trash2,
  Download,
  Plus,
  Check,
  ExternalLink,
  Info,
  Cloud,
  CheckCircle2,
  Loader2,
  HardDrive,
  Edit2,
  Users,
  Share2,
  FolderOpen
} from 'lucide-react';
import { LineAttachment } from '../../types';
import { saveBinaryAttachment, getBinaryAttachment, downloadBlobFile } from '../../utils/fileStorage';
import { resizeAndCompressImage } from '../../utils/imageCompress';
import {
  uploadFileToGoogleDrive,
  getSavedDriveToken,
  requestDriveAccessToken,
  deleteFileFromGoogleDrive,
  updateDriveFileName,
  getSavedSharedDriveEmails,
  saveSharedDriveEmail,
  removeSharedDriveEmail,
  shareDriveFolderWithEmail,
  getDriveFolderUrl
} from '../../services/googleDriveService';
import { useAccounting } from '../../context/AccountingContext';

interface LineAttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  attachments: LineAttachment[];
  onSaveAttachments: (attachments: LineAttachment[]) => void;
}

export const LineAttachmentsModal: React.FC<LineAttachmentsModalProps> = ({
  isOpen,
  onClose,
  itemName,
  attachments,
  onSaveAttachments
}) => {
  const { users, currentUser } = useAccounting();
  const [items, setItems] = useState<LineAttachment[]>(attachments || []);
  const [linkInput, setLinkInput] = useState('');
  const [linkNameInput, setLinkNameInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, { name: string; progress: number }>>({});
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(Boolean(getSavedDriveToken()));
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  
  // File edit state
  const [editingAttId, setEditingAttId] = useState<string | null>(null);
  const [editingAttName, setEditingAttName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Sharing Management state
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [newShareEmail, setNewShareEmail] = useState('');
  const [isSharingEmail, setIsSharingEmail] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>('https://drive.google.com/drive');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when opened and restore previews for items lacking data
  useEffect(() => {
    const initialList = attachments || [];
    setItems(initialList);
    setIsDriveConnected(Boolean(getSavedDriveToken()));
    setSharedEmails(getSavedSharedDriveEmails());
    getDriveFolderUrl().then(url => setDriveFolderUrl(url));

    // Restore any image data from IndexedDB if not in memory
    initialList.forEach(async (att) => {
      if ((att.type?.startsWith('image/') || att.name?.match(/\.(jpg|jpeg|png|webp|gif)$/i)) && !att.data && att.localBlobId) {
        const stored = await getBinaryAttachment(att.localBlobId);
        if (stored?.blob) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            if (dataUrl) {
              setItems(prev => prev.map(item => item.id === att.id ? { ...item, data: dataUrl } : item));
            }
          };
          reader.readAsDataURL(stored.blob);
        }
      }
    });
  }, [attachments, isOpen]);

  if (!isOpen) return null;

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      await requestDriveAccessToken();
      setIsDriveConnected(true);
      const url = await getDriveFolderUrl();
      setDriveFolderUrl(url);
    } catch (err) {
      console.warn('Google Drive token request deferred:', err);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);

    for (const file of fileList) {
      const attId = 'att-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      
      // 1. Save locally to IndexedDB as high-capacity raw binary Blob (100% lossless)
      await saveBinaryAttachment(attId, file, file.name, file.type);

      // 2. Generate lightweight thumbnail / dataURL for all images
      let previewDataUrl: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        try {
          previewDataUrl = await resizeAndCompressImage(file, 800, 800, 0.75);
        } catch {
          previewDataUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = (e) => res(e.target?.result as string);
            reader.onerror = () => res(undefined);
            reader.readAsDataURL(file);
          });
        }
      }

      const newAttachment: LineAttachment = {
        id: attId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        data: previewDataUrl,
        localBlobId: attId,
        storageType: 'local',
        uploadedAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        uploadedBy: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
        uploadedByUserId: currentUser?.id,
        isOriginal: true
      };

      setItems(prev => [...prev, newAttachment]);

      // 3. Background upload to Google Drive if connected or requested
      if (isDriveConnected || getSavedDriveToken()) {
        setUploadingFiles(prev => ({ ...prev, [attId]: { name: file.name, progress: 10 } }));
        try {
          const driveRes = await uploadFileToGoogleDrive(file, file.name, (prog) => {
            setUploadingFiles(prev => ({ ...prev, [attId]: { name: file.name, progress: prog } }));
          });

          setItems(prev => prev.map(item => {
            if (item.id === attId) {
              return {
                ...item,
                driveFileId: driveRes.fileId,
                driveWebViewLink: driveRes.webViewLink,
                driveDownloadLink: driveRes.webContentLink,
                storageType: 'drive'
              };
            }
            return item;
          }));
        } catch (err) {
          console.warn('Drive upload background fallback to local binary storage:', err);
        } finally {
          setUploadingFiles(prev => {
            const next = { ...prev };
            delete next[attId];
            return next;
          });
        }
      }
    }
  };

  const handleDownloadAttachment = async (att: LineAttachment) => {
    if (att.localBlobId) {
      const stored = await getBinaryAttachment(att.localBlobId);
      if (stored?.blob) {
        downloadBlobFile(stored.blob, att.name);
        return;
      }
    }

    if (att.driveWebViewLink || att.driveDownloadLink) {
      window.open(att.driveDownloadLink || att.driveWebViewLink, '_blank');
      return;
    }

    if (att.data) {
      const a = document.createElement('a');
      a.href = att.data;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleAddExternalLink = () => {
    if (!linkInput.trim()) return;
    const newAttachment: LineAttachment = {
      id: 'att-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: linkNameInput.trim() || 'رابط سحابي خارجي (Google Drive / Cloud)',
      data: linkInput.trim(),
      driveWebViewLink: linkInput.trim(),
      type: 'link',
      storageType: 'link',
      uploadedAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      uploadedBy: currentUser?.fullName || currentUser?.username || 'مستخدم النظام'
    };
    setItems(prev => [...prev, newAttachment]);
    setLinkInput('');
    setLinkNameInput('');
  };

  const handleStartEdit = (att: LineAttachment) => {
    setEditingAttId(att.id);
    setEditingAttName(att.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingAttName.trim()) {
      setEditingAttId(null);
      return;
    }
    const cleanName = editingAttName.trim();
    const target = items.find(a => a.id === id);
    setIsSavingName(true);

    if (target?.driveFileId) {
      try {
        await updateDriveFileName(target.driveFileId, cleanName);
      } catch (err) {
        console.warn('Google Drive rename sync note:', err);
      }
    }

    setItems(prev =>
      prev.map(a =>
        a.id === id
          ? {
              ...a,
              name: cleanName,
              isModified: true,
              modifiedAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
            }
          : a
      )
    );
    setIsSavingName(false);
    setEditingAttId(null);
  };

  const handleDelete = async (id: string) => {
    const target = items.find(att => att.id === id);
    const fileName = target?.name || 'المرفق';
    const confirmed = window.confirm(`هل أنت متأكد من حذف المرفق "${fileName}"؟ سيتم حذفه من هذا البند ومن Google Drive.`);
    if (!confirmed) return;

    if (target?.driveFileId) {
      try {
        await deleteFileFromGoogleDrive(target.driveFileId);
      } catch (err) {
        console.warn('Could not delete file from Google Drive:', err);
      }
    }
    setItems(prev => prev.filter(att => att.id !== id));
  };

  const handleShareWithEmail = async (emailToShare: string) => {
    const clean = emailToShare.trim().toLowerCase();
    if (!clean) return;
    setIsSharingEmail(true);
    setShareFeedback(null);
    try {
      const res = await shareDriveFolderWithEmail(clean, 'writer');
      saveSharedDriveEmail(clean);
      setSharedEmails(getSavedSharedDriveEmails());
      setShareFeedback(res.message || `تم تفعيل صلاحية الوصول والتعديل والحذف للإيميل: ${clean}`);
      setNewShareEmail('');
    } catch (err: any) {
      setShareFeedback(`حدث خطأ أثناء المشاركة: ${err?.message || err}`);
    } finally {
      setIsSharingEmail(false);
    }
  };

  const handleRemoveSharedEmail = (email: string) => {
    if (window.confirm(`هل أنت متأكد من إلغاء تفعيل مشاركة المجلد مع (${email})؟`)) {
      removeSharedDriveEmail(email);
      setSharedEmails(getSavedSharedDriveEmails());
    }
  };

  const handleSaveAndClose = () => {
    onSaveAttachments(items);
    onClose();
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileBadge = (name: string, type?: string) => {
    if (type === 'link') {
      return { label: 'رابط', bg: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
    }
    const ext = name.split('.').pop()?.toUpperCase() || '';
    if (ext === 'PDF') return { label: 'PDF', bg: 'bg-rose-100 text-rose-800 border-rose-300' };
    if (ext === 'AI') return { label: 'AI', bg: 'bg-orange-100 text-orange-900 border-orange-300' };
    if (ext === 'PSD') return { label: 'PSD', bg: 'bg-blue-100 text-blue-900 border-blue-300' };
    if (ext === 'EPS') return { label: 'EPS', bg: 'bg-purple-100 text-purple-900 border-purple-300' };
    if (ext === 'SVG') return { label: 'SVG', bg: 'bg-amber-100 text-amber-900 border-amber-300' };
    if (ext === 'CDR') return { label: 'CDR', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
    if (['JPG', 'JPEG', 'PNG', 'WEBP'].includes(ext)) return { label: ext, bg: 'bg-teal-100 text-teal-800 border-teal-300' };
    if (['ZIP', 'RAR'].includes(ext)) return { label: ext, bg: 'bg-amber-100 text-amber-900 border-amber-300' };
    return { label: ext || 'ملف', bg: 'bg-slate-100 text-slate-800 border-slate-300' };
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between border-b border-blue-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl text-amber-300">
              <Paperclip className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>مرفقات البند وتصاميم Google Drive</span>
                <span className="text-xs bg-amber-400 text-amber-950 font-black px-2 py-0.5 rounded-full">
                  {items.length} مرفق
                </span>
              </h2>
              <p className="text-xs text-blue-200 truncate max-w-md">
                الصنف: <strong className="text-white">{itemName || 'بند أمر الطباعة'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl text-blue-100 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cloud & Quality Status Bar */}
        <div className="bg-slate-800 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-700">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              جودة أصلية 100% بدون أي ضغط
            </span>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-300 flex items-center gap-1 text-[11px]">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              تخزين عالي السعة
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSharePanel(!showSharePanel)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                showSharePanel
                  ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-xs'
                  : 'bg-slate-700 hover:bg-slate-600 text-amber-300 border-slate-600'
              }`}
              title="إدارة صلاحيات مشاركة مجلد الدرايف مع مستخدمي النظام"
            >
              <Users className="w-3.5 h-3.5" />
              <span>مشاركة الصلاحيات ({sharedEmails.length})</span>
            </button>

            {isDriveConnected ? (
              <a
                href={driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                title="فتح المجلد في Google Drive"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Google Drive</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
                className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
              >
                {isConnectingDrive ? <Loader2 className="w-3 h-3 animate-spin" /> : 'تنشيط الربط السحابي'}
              </button>
            )}
          </div>
        </div>

        {/* Team Sharing & Access Management Accordion */}
        {showSharePanel && (
          <div className="bg-amber-50/70 border-b border-amber-200 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-700" />
                <h3 className="text-xs font-bold text-amber-950">
                  إدارة مشاركة مجلد الدرايف (صلاحية كاملة: وصول، تعديل، وحذف لكافة المستخدمين المفعّلين)
                </h3>
              </div>
              <span className="text-[10px] text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full font-bold">
                Writer Role (محرر ومشارك)
              </span>
            </div>
            
            <p className="text-[11px] text-amber-900 mb-3 leading-relaxed">
              كل مستخدم يتم تفعيله هنا يمتلك صلاحية كاملة على Google Drive لمعاينة وتعديل وتنزيل وحذف المرفقات والتصاميم الخاصة بأوامر الطباعة.
            </p>

            {/* Input to add email */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="email"
                value={newShareEmail}
                onChange={e => setNewShareEmail(e.target.value)}
                placeholder="أدخل البريد الإلكتروني لموظف أو مصمم أو فني (Gmail)..."
                className="text-xs border border-amber-300 rounded-lg px-3 py-1.5 flex-1 bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => handleShareWithEmail(newShareEmail)}
                disabled={isSharingEmail || !newShareEmail.trim()}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                {isSharingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>تفعيل صلاحية الوصول والتعديل والحذف</span>
              </button>
            </div>

            {/* Quick add from system users */}
            {users && users.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-amber-900 mb-3">
                <span className="font-bold">إضافة سريعة من مستخدمي النظام:</span>
                {users
                  .filter(u => u.email && !sharedEmails.includes(u.email.toLowerCase()))
                  .slice(0, 5)
                  .map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleShareWithEmail(u.email || '')}
                      className="bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold px-2 py-0.5 rounded text-[10px] cursor-pointer flex items-center gap-1 transition"
                    >
                      <Plus className="w-2.5 h-2.5 text-amber-600" />
                      <span>{u.fullName || u.username} ({u.email})</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Feedback message */}
            {shareFeedback && (
              <div className="mb-2 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 p-2 rounded-lg flex items-center justify-between">
                <span>{shareFeedback}</span>
                <button type="button" onClick={() => setShareFeedback(null)} className="text-emerald-700 hover:text-emerald-950">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Current Shared List */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-amber-950">المستخدمون المصرح لهم حالياً:</span>
              {sharedEmails.length === 0 ? (
                <span className="text-[11px] text-amber-700 italic">لم تتم إضافة إيميلات مخصصة بعد (المجلد متاح لمالك الحساب وجميع الروابط المباشرة).</span>
              ) : (
                sharedEmails.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 bg-white border border-amber-300 text-amber-950 px-2 py-0.5 rounded-lg text-[11px] font-mono shadow-2xs"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSharedEmail(email)}
                      className="text-red-500 hover:text-red-700 cursor-pointer p-0.5"
                      title="إلغاء التفعيل"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto bg-slate-50/50">
          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/80 scale-[0.99]'
                : 'border-slate-300 bg-white hover:bg-slate-50 hover:border-blue-400'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,.pdf,.ai,.psd,.eps,.svg,.cdr,.tif,.tiff,.zip,.rar"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-full shadow-xs">
                <Upload className="w-6 h-6" />
              </div>
              <div className="font-bold text-slate-800 text-sm">
                انقر لاختيار ملفات أو اسحب وأفلت ملفات الطباعة والتصاميم هنا (يمكن إرفاق أكثر من ملف للبند)
              </div>
              <div className="text-xs text-slate-600 font-medium">
                يتم رفع الملفات مباشرة إلى Google Drive وحفظها بجودتها الأصلية بدون أي ضغط
              </div>
              {/* Badges for Supported Print Formats */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">PDF</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-teal-100 text-teal-800 border border-teal-300">JPG / PNG</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-orange-100 text-orange-900 border border-orange-300">AI (Illustrator)</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-300">PSD (Photoshop)</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-purple-100 text-purple-900 border border-purple-300">EPS</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">SVG</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">CDR (CorelDraw)</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300">ZIP / RAR</span>
              </div>
            </div>
          </div>

          {/* Upload Progress Display */}
          {Object.keys(uploadingFiles).length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>جارٍ الرفع بجودة أصلية إلى Google Drive...</span>
              </div>
              {Object.entries(uploadingFiles).map(([id, info]: [string, { name: string; progress: number }]) => (
                <div key={id} className="text-[11px] text-blue-800 flex items-center justify-between">
                  <span className="truncate max-w-[200px]">{info.name}</span>
                  <span className="font-mono font-bold">100% جودة كاملة</span>
                </div>
              ))}
            </div>
          )}

          {/* External Link Section */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4 text-indigo-600" />
              <span>أو أضف رابط سحابي خارجي (Google Drive, WeTransfer, Dropbox)</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={linkNameInput}
                onChange={(e) => setLinkNameInput(e.target.value)}
                placeholder="عنوان الملف / الوصف (اختياري)"
                className="text-xs border border-slate-300 rounded-lg px-3 py-2 sm:w-1/3 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="الصق الرابط هنا https://drive.google.com/..."
                className="text-xs border border-slate-300 rounded-lg px-3 py-2 flex-1 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddExternalLink}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة رابط</span>
              </button>
            </div>
          </div>

          {/* Attachments List */}
          <div>
            <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
              <span>مرفقات هذا البند ({items.length})</span>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('هل أنت متأكد من حذف كافة المرفقات لهذا البند؟')) {
                      setItems([]);
                    }
                  }}
                  className="text-red-500 hover:text-red-700 text-[11px] font-semibold cursor-pointer"
                >
                  حذف الكل
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                لا توجد مرفقات مرفوعة لهذا البند حتى الآن. انقر بالأعلى لإرفاق ملف أو أكثر.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {items.map((att) => {
                  const isImage = att.type?.startsWith('image/') || att.data?.startsWith('data:image/');
                  const isLink = att.type === 'link';
                  const badge = getFileBadge(att.name, att.type);
                  const isEditingThis = editingAttId === att.id;

                  return (
                    <div
                      key={att.id}
                      className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                        {isImage && att.data ? (
                          <img
                            src={att.data}
                            alt={att.name}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                          />
                        ) : isLink ? (
                          <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                            <ExternalLink className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}

                        <div className="overflow-hidden flex-1">
                          {isEditingThis ? (
                            <div className="flex items-center gap-1 my-1">
                              <input
                                type="text"
                                value={editingAttName}
                                onChange={e => setEditingAttName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveEdit(att.id);
                                  if (e.key === 'Escape') setEditingAttId(null);
                                }}
                                autoFocus
                                className="text-xs font-bold border border-blue-400 rounded px-2 py-0.5 flex-1 bg-blue-50/50"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(att.id)}
                                disabled={isSavingName}
                                className="bg-emerald-600 text-white p-1 rounded hover:bg-emerald-700 cursor-pointer"
                                title="حفظ الاسم"
                              >
                                {isSavingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingAttId(null)}
                                className="bg-slate-200 text-slate-700 p-1 rounded hover:bg-slate-300 cursor-pointer"
                                title="إلغاء"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className={`text-[9px] font-mono font-black px-1.5 py-0.2 rounded border shrink-0 ${badge.bg}`}>
                                {badge.label}
                              </span>
                              <span className="text-xs font-bold text-slate-800 truncate" title={att.name}>
                                {att.name}
                              </span>
                            </div>
                          )}

                          <div className="text-[9px] text-slate-400 font-light flex items-center gap-2 mt-0.5 flex-wrap">
                            {att.size && <span>{formatFileSize(att.size)}</span>}
                            {att.uploadedAt && <span>{att.uploadedAt}</span>}
                            {att.uploadedBy && <span className="text-slate-500 font-medium">بواسطة: {att.uploadedBy}</span>}
                            {att.isModified && <span className="text-amber-600 font-bold">(مُعدّل)</span>}
                            {att.driveFileId && (
                              <span className="text-blue-600 font-bold flex items-center gap-0.5">
                                <Cloud className="w-2.5 h-2.5" /> Drive
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Edit Name Button */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(att)}
                          className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-amber-600 rounded-lg transition-colors cursor-pointer"
                          title="تعديل اسم أو مواصفة المرفق"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Download / Open Button */}
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att)}
                          className="p-1.5 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                          title="فتح أو تحميل المرفق بالجودة الأصلية"
                        >
                          {isLink ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                        </button>

                        {/* Delete Button with confirmation */}
                        <button
                          type="button"
                          onClick={() => handleDelete(att.id)}
                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                          title="حذف المرفق من البند ومن Google Drive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>المرفقات مرتبطة تلقائياً بـ Google Drive وتُحفظ بجودتها الأصلية بدون أي ضغط</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد وحفظ المرفقات للبند</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
