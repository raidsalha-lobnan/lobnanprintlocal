import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText } from 'lucide-react';

// A4 at the browser's standard 96 CSS pixels per inch (210 x 297 mm).
const PAGE_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;

interface ReportsA4PagerProps {
  reportKey: string;
  children: React.ReactNode;
}

/**
 * Screen-only A4 page navigator. Chrome's multicolumn fragmentation flows
 * the original React document across full-sized A4 columns (text stays live).
 * Print CSS removes the navigator and restores the ORIGINAL report DOM, so
 * native print and server-generated PDFs are never rasterized or modified.
 */
export const ReportsA4Pager: React.FC<ReportsA4PagerProps> = ({ reportKey, children }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(1);
  const countRef = useRef(1);
  const lastWheelRef = useRef(0);
  const verticalFallbackRef = useRef(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(0.6);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setToolbarTarget(document.getElementById('reports-pager-toolbar'));
  }, []);

  const goToPage = useCallback((requested: number) => {
    const next = Math.min(Math.max(1, requested), countRef.current);
    currentRef.current = next;
    setPage(next);
    const viewport = viewportRef.current;
    if (viewport) {
      if (verticalFallbackRef.current) viewport.scrollTop = (next - 1) * viewport.clientHeight;
      else viewport.scrollLeft = (next - 1) * viewport.clientWidth;
    }
  }, []);

  useLayoutEffect(() => {
    currentRef.current = 1;
    countRef.current = 1;
    lastWheelRef.current = 0;
    verticalFallbackRef.current = false;
    setPage(1);
    setPageCount(1);
    if (viewportRef.current) { viewportRef.current.scrollLeft = 0; viewportRef.current.scrollTop = 0; }

    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const flow = flowRef.current;
    if (!stage || !viewport || !flow) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const availableWidth = Math.max(1, stage.clientWidth - 10);
      const availableHeight = Math.max(1, stage.clientHeight - 14);
      const nextScale = Math.min(1, availableWidth / PAGE_WIDTH, availableHeight / PAGE_HEIGHT);
      setScale(previous => Math.abs(previous - nextScale) > 0.002 ? nextScale : previous);

      // Each CSS column is one A4 sheet. No report lines or photos are
      // hidden: overflowing content becomes the next column/sheet.
      const horizontalPages = Math.max(1, Math.ceil((flow.scrollWidth - 1) / Math.max(1, flow.clientWidth)));
      // Fallback for an unfragmentable oversized block: expose its full height
      // as A4-sized steps rather than clipping the remainder of the report.
      const tallPages = Math.max(1, Math.ceil((flow.scrollHeight - 1) / Math.max(1, flow.clientHeight)));
      const verticalOnly = horizontalPages === 1 && tallPages > 1;
      verticalFallbackRef.current = verticalOnly;
      viewport.style.overflowY = verticalOnly ? 'auto' : 'hidden';
      const nextCount = verticalOnly ? tallPages : horizontalPages;
      countRef.current = nextCount;
      setPageCount(previous => previous === nextCount ? previous : nextCount);
      const boundedPage = Math.min(currentRef.current, nextCount);
      if (boundedPage !== currentRef.current) {
        currentRef.current = boundedPage;
        setPage(boundedPage);
      }
      if (verticalFallbackRef.current) {
        viewport.scrollLeft = 0;
        viewport.scrollTop = (currentRef.current - 1) * viewport.clientHeight;
      } else {
        viewport.scrollTop = 0;
        viewport.scrollLeft = (currentRef.current - 1) * viewport.clientWidth;
      }
    };
    const scheduleMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const resize = new ResizeObserver(scheduleMeasure);
    resize.observe(stage);
    resize.observe(flow);
    const mutation = new MutationObserver(scheduleMeasure);
    mutation.observe(flow, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['style', 'class', 'src'] });
    const onImageLoad = () => scheduleMeasure();
    flow.addEventListener('load', onImageLoad, true);
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 6) return;
      const now = performance.now();
      if (now - lastWheelRef.current < 230) return;
      lastWheelRef.current = now;
      const next = Math.min(Math.max(1, currentRef.current + Math.sign(delta)), countRef.current);
      goToPage(next);
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', scheduleMeasure);
    document.fonts?.ready.then(scheduleMeasure).catch(() => undefined);
    scheduleMeasure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      flow.removeEventListener('load', onImageLoad, true);
      stage.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [reportKey, goToPage]);

  return (
    <div className="report-pager-stage" ref={stageRef} aria-label="معاينة التقارير المقسمة إلى صفحات A4">
      {toolbarTarget ? createPortal(
        <div className="report-pager-controls print:hidden" dir="rtl" aria-live="polite">
          <button type="button" title="الصفحة الأولى" aria-label="الصفحة الأولى" disabled={page <= 1} onClick={() => goToPage(1)}><ChevronsRight className="h-4 w-4" /></button>
          <button type="button" title="الصفحة السابقة" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => goToPage(page - 1)}><ChevronRight className="h-4 w-4" /></button>
          <span className="reports-page-label tabular-nums">صفحة {page} من {pageCount}</span>
          <button type="button" title="الصفحة التالية" aria-label="الصفحة التالية" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" title="الصفحة الأخيرة" aria-label="الصفحة الأخيرة" disabled={page >= pageCount} onClick={() => goToPage(pageCount)}><ChevronsLeft className="h-4 w-4" /></button>
        </div>, toolbarTarget
      ) : null}
      <div className="report-pager-frame" style={{
        width: PAGE_WIDTH * scale,
        height: PAGE_HEIGHT * scale,
      }}>
        <div className="report-pager-viewport" ref={viewportRef} style={{
          transform: 'scale(' + scale + ')',
        }}>
          <div className="report-pager-flow" ref={flowRef}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
