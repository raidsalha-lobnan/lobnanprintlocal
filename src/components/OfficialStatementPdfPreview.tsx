import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { authHeaders, getCurrentSessionToken, publicSyncApiUrl } from '../services/secureAuth';
import type { OfficialStatementRequest } from '../utils/serverOfficialStatementPdf';
import { ReportsA4Pager } from './ReportsA4Pager';

type Props = {
  reportKey: string;
  request: OfficialStatementRequest;
  children: React.ReactNode;
};

const fetchOfficialPdf = async (request: OfficialStatementRequest, signal: AbortSignal) => {
  const api = publicSyncApiUrl().replace(/\/+$/, '');
  const token = getCurrentSessionToken();
  if (!token) throw new Error('يلزم تسجيل الدخول لإنشاء معاينة PDF.');
  const response = await fetch(api + '/api/v1/reports/official-pdf', {
    method: 'POST',
    cache: 'no-store',
    signal,
    headers: {
      ...authHeaders(api, token),
      'Content-Type': 'application/json',
      'Accept': 'application/pdf',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('خدمة PDF لم تستجب: HTTP ' + response.status);
  const blob = await response.blob();
  if (blob.size < 500 || blob.size > 60_000_000 || await blob.slice(0, 5).text() !== '%PDF-') {
    throw new Error('الخادم لم يرجع مستند PDF صالحًا.');
  }
  return new Uint8Array(await blob.arrayBuffer());
};

/**
 * For detailed account reports, render the SAME server-generated Chrome PDF
 * used by the direct-save action. This removes the mismatch caused by CSS
 * multi-column fragmentation (split tables, misplaced photos and margins).
 *
 * The original live React document stays mounted for native browser print;
 * the PDF canvas is screen-only. A failed PDF fetch falls back to HTML preview.
 */
export const ReportsVerifiedPreview: React.FC<{reportKey: string; request?: OfficialStatementRequest | null; children: React.ReactNode}> = ({reportKey, request, children}) => request
  ? <OfficialStatementPdfPreview request={request} reportKey={reportKey}>{children}</OfficialStatementPdfPreview>
  : <ReportsA4Pager reportKey={reportKey}>{children}</ReportsA4Pager>;

export const OfficialStatementPdfPreview: React.FC<Props> = ({ request, reportKey, children }) => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 600, height: 520 });
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{x:number; y:number; left:number; top:number}|null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef(1);
  const countRef = useRef(1);
  const lastWheelRef = useRef(0);
  const key = JSON.stringify(request);

  useLayoutEffect(() => {
    setToolbar(document.getElementById('reports-pager-toolbar'));
    const stage = stageRef.current;
    if (!stage) return;
    const resize = new ResizeObserver(() => {
      setStageSize({
        width: Math.max(100, stage.clientWidth),
        height: Math.max(100, stage.clientHeight),
      });
    });
    resize.observe(stage);
    return () => resize.disconnect();
  }, [reportKey]);

  useEffect(() => {
    let closed = false;
    const abort = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let loaded: PDFDocumentProxy | undefined;
    setPdf(null);
    setError('');
    setPageCount(1);
    setPage(1);
    pageRef.current = 1;
    countRef.current = 1;
    setZoom(1);
    const timeout = window.setTimeout(() => {
      if (!closed) {
        setError('انتهت مهلة تجهيز PDF.');
        abort.abort();
      }
    }, 90000);
    const delay = window.setTimeout(async () => {
      try {
        const bytes = await fetchOfficialPdf(request, abort.signal);
        if (closed) return;
        const library = await import('pdfjs-dist/legacy/build/pdf.mjs');
        library.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = library.getDocument({ data: bytes, useSystemFonts: true });
        loaded = await loadingTask.promise;
        if (closed) return;
        window.clearTimeout(timeout);
        setPdf(loaded);
        countRef.current = Math.max(1, loaded.numPages);
        setPageCount(countRef.current);
      } catch (cause) {
        window.clearTimeout(timeout);
        if (closed || abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'تعذّر تحميل المعاينة الرسمية.');
      }
    }, 550);
    return () => {
      closed = true;
      window.clearTimeout(delay);
      window.clearTimeout(timeout);
      abort.abort();
      if (loadingTask) void loadingTask.destroy();
    };
  }, [key]);

  useEffect(() => {
    if (!pdf) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let closed = false;
    let task: RenderTask | undefined;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (closed || !canvasRef.current) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const factor = Math.min(1.8,
          Math.max(0.1, (stageSize.width - 16) / original.width),
          Math.max(0.1, (stageSize.height - 16) / original.height));
        const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
        const view = pdfPage.getViewport({ scale: factor * zoom * pixelRatio });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;
        canvas.width = Math.round(view.width);
        canvas.height = Math.round(view.height);
        canvas.style.width = Math.round(view.width / pixelRatio) + 'px';
        canvas.style.height = Math.round(view.height / pixelRatio) + 'px';
        task = pdfPage.render({ canvasContext: context, canvas, viewport: view });
        await task.promise;
      } catch (cause) {
        if (!closed && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) {
          console.warn('Official report preview paint failed', cause);
          setError('تعذّر رسم إحدى صفحات PDF؛ تُعرض المعاينة البديلة.');
        }
      }
    })();
    return () => {
      closed = true;
      task?.cancel();
    };
  }, [pdf, page, stageSize.width, stageSize.height, zoom]);

  const goTo = (index: number) => {
    const next = Math.min(countRef.current, Math.max(1, index));
    pageRef.current = next;
    setPage(next);
    if (scrollRef.current) { scrollRef.current.scrollTop = 0; scrollRef.current.scrollLeft = 0; }
  };

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 6) return;
      const now = performance.now();
      if (now - lastWheelRef.current < 240) return;
      lastWheelRef.current = now;
      goTo(pageRef.current + Math.sign(delta));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [pdf]);

  if (error) {
    return (
      <div className="reports-official-fallback">
        <div className="reports-preview-notice print:hidden" role="status">
          تعذّرت معاينة PDF المطابقة للطباعة؛ تُعرض المعاينة البديلة. {error}
        </div>
        <ReportsA4Pager reportKey={reportKey}>{children}</ReportsA4Pager>
      </div>
    );
  }

  return (
    <div className="reports-official-preview-stage print:contents" ref={stageRef}>
      {toolbar && createPortal(
        <div className="report-pager-controls print:hidden" dir="rtl" aria-live="polite">
          <button type="button" title="الصفحة الأولى" disabled={page <= 1} onClick={() => goTo(1)}><ChevronsRight className="h-4 w-4" /></button>
          <button type="button" title="الصفحة السابقة" disabled={page <= 1} onClick={() => goTo(page - 1)}><ChevronRight className="h-4 w-4" /></button>
          <span className="reports-page-label tabular-nums">{pdf ? 'صفحة ' + page + ' من ' + pageCount : 'تجهيز المعاينة...'}</span>
          <button type="button" title="الصفحة التالية" disabled={!pdf || page >= pageCount} onClick={() => goTo(page + 1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" title="الصفحة الأخيرة" disabled={!pdf || page >= pageCount} onClick={() => goTo(pageCount)}><ChevronsLeft className="h-4 w-4" /></button>
          <button type="button" title="تكبير المعاينة" aria-label="تكبير المعاينة" disabled={!pdf || zoom >= 3} onClick={() => setZoom(n => Math.min(3, +(n + 0.25).toFixed(2)))}><ZoomIn className="h-4 w-4" /></button>
          <button type="button" title="تصغير المعاينة" aria-label="تصغير المعاينة" disabled={!pdf || zoom <= 1} onClick={() => setZoom(n => Math.max(1, +(n - 0.25).toFixed(2)))}><ZoomOut className="h-4 w-4" /></button>
        </div>, toolbar
      )}
      <div className="reports-official-canvas print:hidden" ref={scrollRef}
        onPointerDown={e => { if (zoom <= 1) return; const n = scrollRef.current; if (!n) return; dragRef.current = {x:e.clientX,y:e.clientY,left:n.scrollLeft,top:n.scrollTop}; n.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { const d = dragRef.current; const n = scrollRef.current; if (d && n) { n.scrollLeft = d.left - (e.clientX - d.x); n.scrollTop = d.top - (e.clientY - d.y); } }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}>
        {pdf ? <canvas aria-label={'المعاينة الرسمية لصفحة ' + page + ' من ' + pageCount} ref={canvasRef} /> :
          <div className="flex items-center gap-2 text-sm text-slate-600" role="status">
            <LoaderCircle className="w-4 h-4 animate-spin" /> جاري تجهيز المعاينة المطابقة للطباعة…
          </div>}
      </div>
      <div className="reports-original-print-document">{children}</div>
    </div>
  );
};
