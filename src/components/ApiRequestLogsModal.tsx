import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  Trash2, 
  Download, 
  Filter, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Server, 
  X, 
  ChevronDown, 
  ChevronUp,
  Globe,
  FileText
} from 'lucide-react';

interface ApiLogItem {
  id: string;
  timestamp: number;
  iso: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: {
    host?: string;
    'user-agent'?: string;
    'content-type'?: string;
    'authorization'?: string;
    'x-requested-with'?: string;
    origin?: string;
    referer?: string;
  };
  body?: any;
  statusCode: number;
  durationMs: number;
}

interface ApiRequestLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiRequestLogsModal: React.FC<ApiRequestLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ApiLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [showOnly405, setShowOnly405] = useState<boolean>(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/logs/requests');
      const data = await res.json();
      if (data && data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch API request logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchLogs();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh]);

  const clearLogs = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع سجلات الطلبات؟')) return;
    try {
      await fetch('/api/logs/requests', { method: 'DELETE' });
      setLogs([]);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const exportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `api_request_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredLogs = logs.filter(log => {
    if (showOnly405 && log.statusCode !== 405) return false;
    if (selectedMethod !== 'ALL' && log.method !== selectedMethod) return false;
    if (selectedStatus !== 'ALL') {
      const statusNum = parseInt(selectedStatus, 10);
      if (log.statusCode !== statusNum) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchPath = log.path.toLowerCase().includes(q);
      const matchHeader = JSON.stringify(log.headers).toLowerCase().includes(q);
      const matchBody = JSON.stringify(log.body || '').toLowerCase().includes(q);
      if (!matchPath && !matchHeader && !matchBody) return false;
    }
    return true;
  });

  const count405 = logs.filter(l => l.statusCode === 405).length;
  const count500 = logs.filter(l => l.statusCode >= 500).length;
  const countSuccess = logs.filter(l => l.statusCode >= 200 && l.statusCode < 300).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col shadow-2xl text-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                تقرير سجلات حركة الخادم التلقائية (/api/)
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  نشط (Live Monitor)
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                رصد وتتبع جميع طلبات الواردة إلى مسارات `/api/` لتحديد الأنماط وترويسات الطلبات المسببة لخطأ 405 أو غيره
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <button
              onClick={() => setShowOnly405(!showOnly405)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors ${
                showOnly405 
                  ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/50' 
                  : 'bg-slate-800 text-rose-300 border-rose-500/40 hover:bg-slate-700'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              أخطاء 405 فقط ({count405})
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="تحديث السجلات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <button
              onClick={exportLogs}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-xl border border-emerald-500/30 transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="تصدير السجلات كملف JSON"
            >
              <Download className="w-4 h-4" />
              تصدير
            </button>
            <button
              onClick={clearLogs}
              className="p-2 bg-slate-800 hover:bg-rose-900/30 text-rose-300 rounded-xl border border-rose-500/30 transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="مسح كافة السجلات"
            >
              <Trash2 className="w-4 h-4" />
              مسح
            </button>
            <div className="h-6 w-px bg-slate-700 mx-1"></div>
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 px-6 py-3 bg-slate-950/60 border-b border-slate-800 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-slate-400">إجمالي الطلبات المرصودة</span>
            <span className="font-bold text-white text-sm">{logs.length}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
            <span className="text-emerald-400">ناجحة (2xx)</span>
            <span className="font-bold text-emerald-300 text-sm">{countSuccess}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-rose-950/20 rounded-xl border border-rose-500/20">
            <span className="text-rose-400">أخطاء 405 Method Not Allowed</span>
            <span className="font-bold text-rose-300 text-sm">{count405}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-amber-950/20 rounded-xl border border-amber-500/20">
            <span className="text-amber-400">أخطاء الخادم (5xx)</span>
            <span className="font-bold text-amber-300 text-sm">{count500}</span>
          </div>
        </div>

        {/* Filters bar */}
        <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في المسارات، الترويسات (Headers)، أو محتوى الطلب..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">طريقة الطلب:</span>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">الكل</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="OPTIONS">OPTIONS</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">حالة الاستجابة:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">الكل</option>
              <option value="200">200 OK</option>
              <option value="405">405 Method Not Allowed</option>
              <option value="400">400 Bad Request</option>
              <option value="404">404 Not Found</option>
              <option value="500">500 Server Error</option>
            </select>
          </div>

          <label className="flex items-center space-x-2 space-x-reverse cursor-pointer text-xs text-slate-300 bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
            />
            <span>تحديث تلقائي (كل 4 ثوانٍ)</span>
          </label>
        </div>

        {/* Logs List / Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 font-sans">
              <Server className="w-12 h-12 stroke-1 text-slate-600" />
              <p className="text-sm">لا توجد سجلات مطابقة لمعايير البحث الحالية.</p>
              <p className="text-xs text-slate-600">سيتم تسجيل أي طلب يصل إلى مسارات `/api/` فوراً في هذه القائمة.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const isError405 = log.statusCode === 405;
              const isErrorServer = log.statusCode >= 500;
              const isSuccess = log.statusCode >= 200 && log.statusCode < 300;

              return (
                <div
                  key={log.id}
                  className={`border rounded-xl transition-all overflow-hidden ${
                    isError405
                      ? 'bg-rose-950/10 border-rose-500/40 hover:border-rose-500'
                      : isErrorServer
                      ? 'bg-amber-950/10 border-amber-500/40'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <span className={`px-2 py-1 rounded font-bold text-[11px] uppercase ${
                        log.method === 'GET' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' :
                        log.method === 'POST' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        log.method === 'PUT' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        log.method === 'DELETE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      }`}>
                        {log.method}
                      </span>

                      <span className="text-slate-200 font-semibold tracking-wide text-xs">
                        {log.path}
                      </span>

                      {log.query && Object.keys(log.query).length > 0 && (
                        <span className="text-slate-400 text-[11px] truncate max-w-xs">
                          ?{new URLSearchParams(log.query).toString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 space-x-reverse font-sans text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        isSuccess ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        isError405 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {isSuccess ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {log.statusCode} {isError405 ? 'Method Not Allowed' : ''}
                      </span>

                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {log.durationMs}ms
                      </span>

                      <span className="text-slate-500 text-[11px]">
                        {new Date(log.timestamp).toLocaleTimeString('ar-EG')}
                      </span>

                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-slate-900/95 border-t border-slate-800 space-y-3 text-[11px]">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-slate-400 font-bold mb-1.5 flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-blue-400" />
                            ترويسات الطلب (Request Headers & Context):
                          </h4>
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1 text-slate-300">
                            <div><strong className="text-slate-500">Host:</strong> {log.headers.host || 'N/A'}</div>
                            <div><strong className="text-slate-500">User-Agent:</strong> {log.headers['user-agent'] || 'N/A'}</div>
                            <div><strong className="text-slate-500">Content-Type:</strong> {log.headers['content-type'] || 'N/A'}</div>
                            <div><strong className="text-slate-500">X-Requested-With:</strong> {log.headers['x-requested-with'] || 'N/A'}</div>
                            <div><strong className="text-slate-500">Origin / Referer:</strong> {log.headers.origin || log.headers.referer || 'N/A'}</div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-slate-400 font-bold mb-1.5 flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-emerald-400" />
                            محتوى جسم الطلب (Request Body):
                          </h4>
                          <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-40">
                            {log.body ? JSON.stringify(log.body, null, 2) : '(لا يوجد محتوى في جسم الطلب)'}
                          </pre>
                        </div>
                      </div>

                      {isError405 && (
                        <div className="p-2.5 bg-rose-950/30 border border-rose-500/40 rounded-lg text-rose-300 font-sans">
                          <strong>تحليل سبب خطأ 405:</strong> هذا الرد يعني أن الخادم استقبل طلب بطريقة (Method مثل {log.method}) غير مدعومة أو غير مطابقة للـ Route المحدد في السيرفر. تحقق من تطابق Method الطلب مع إعدادات المسار.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-800/80 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400 font-sans">
          <span>يتم تحديث السجلات تلقائياً وحفظها في مجلد `.sync_data/api_requests_log.json`</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
