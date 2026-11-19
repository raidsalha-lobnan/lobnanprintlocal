import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  reportKey: string;
  children: React.ReactNode;
}

/**
 * The screen preview renders the ORIGINAL live React report. No PDF fetch,
 * server-side SSR copy, rasterized canvas, or CSS multicolumn fragmentation.
 *
 * The header controls navigate through consecutive, non-overlapping viewport
 * segments, so no content is skipped on short screens. These are viewing
 * segments, NOT claims about where the native A4 printer will break pages.
 * Print always uses the exact same report DOM with normal print CSS.
 */
export const ReportsLivePreview: React.FC<Props> = ({ reportKey, children }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef({ page: 1, count: 1, step: 1 });
  const lastWheelRef = useRef(0);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);

  const setPageTo = useCallback((requested: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(1, Math.min(latestRef.current.count, requested));
    latestRef.current.page = next;
    setPage(next);
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const top = Math.min(maxScroll, (next - 1) * latestRef.current.step);
    viewport.scrollTop = top;
  }, []);

  useLayoutEffect(() => {
    setToolbar(document.getElementById('reports-pager-toolbar'));
  }, []);

  useLayoutEffect(() => {
    // Switching report types must always start at the top of their own report.
    latestRef.current.page = 1;
    lastWheelRef.current = 0;
    setPage(1);
    setCount(1);
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;

    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !viewport || !content) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      // One segment never exceeds the visible area: never skip hidden rows.
      const step = Math.max(1, viewport.clientHeight - 14);
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const total = Math.max(1, Math.ceil(maxScroll / step) + 1);
      latestRef.current.step = step;
      latestRef.current.count = total;
      setCount(previous => previous === total ? previous : total);
      const next = Math.min(latestRef.current.page, total);
      latestRef.current.page = next;
      setPage(previous => previous === next ? previous : next);
      viewport.scrollTop = Math.min(maxScroll, (next - 1) * step);
    };
    const requestMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // Secondary devices may run older browser engines: observers are optional.
    // The preview must still open and be printable without either API.
    const resize = typeof ResizeObserver === 'function'
      ? new ResizeObserver(requestMeasure) : null;
    resize?.observe(stage);
    resize?.observe(content);
    const mutation = typeof MutationObserver === 'function'
      ? new MutationObserver(requestMeasure) : null;
    mutation?.observe(content, { childList: true, subtree: true, characterData: true });
    content.addEventListener('load', requestMeasure, true);
    window.addEventListener('resize', requestMeasure);
    document.fonts?.ready?.then(requestMeasure).catch(() => undefined);

    // Each wheel gesture is a single navigation step, not document scrolling.
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 6) return;
      const now = performance.now();
      if (now - lastWheelRef.current < 220) return;
      lastWheelRef.current = now;
      setPageTo(latestRef.current.page + Math.sign(delta));
    };
    viewport.addEventListener('wheel', wheel, { passive: false });
    requestMeasure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation?.disconnect();
      content.removeEventListener('load', requestMeasure, true);
      viewport.removeEventListener('wheel', wheel);
      window.removeEventListener('resize', requestMeasure);
    };
  }, [reportKey, zoom, setPageTo]);

  return (
    <div className="reports-live-stage print:block" ref={stageRef} data-report-source="live-react">
      {toolbar && createPortal(
        <div className="report-pager-controls print:hidden" dir="rtl" aria-label="التنقل في المعاينة">
          <button type="button" aria-label="بداية الكشف" title="بداية الكشف" disabled={page <= 1} onClick={() => setPageTo(1)}><ChevronsRight className="h-4 w-4" /></button>
          <button type="button" aria-label="المقطع السابق" title="المقطع السابق" disabled={page <= 1} onClick={() => setPageTo(page - 1)}><ChevronRight className="h-4 w-4" /></button>
          <span className="reports-page-label tabular-nums" title="مقاطع عرض متتابعة؛ قد تختلف عن صفحات الطباعة">عرض {page} من {count}</span>
          <button type="button" aria-label="المقطع التالي" title="المقطع التالي" disabled={page >= count} onClick={() => setPageTo(page + 1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="نهاية الكشف" title="نهاية الكشف" disabled={page >= count} onClick={() => setPageTo(count)}><ChevronsLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="تكبير المعاينة" title="تكبير المعاينة" disabled={zoom >= 1.6} onClick={() => setZoom(value => Math.min(1.6, +(value + 0.1).toFixed(2)))}><ZoomIn className="h-4 w-4" /></button>
          <button type="button" aria-label="تصغير المعاينة" title="تصغير المعاينة" disabled={zoom <= 0.8} onClick={() => setZoom(value => Math.max(0.8, +(value - 0.1).toFixed(2)))}><ZoomOut className="h-4 w-4" /></button>
        </div>,
        toolbar
      )}
      <div className="reports-live-viewport" ref={viewportRef}>
        <div className="reports-live-content" ref={contentRef} style={{ zoom }} dir="rtl">
          {children}
        </div>
      </div>
    </div>
  );
};
