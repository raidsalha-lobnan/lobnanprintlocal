import { useLayoutEffect, useRef } from 'react';

/**
 * Keep all fifteen report choices and the currently relevant filters visible.
 * Fit to the available workspace height without creating a large white filler
 * panel below the last control.
 */
export function useReportsSidebarFit() {
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const content = sidebarContentRef.current;
    const grid = sidebar?.parentElement;
    if (!sidebar || !content || !grid) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const computed = getComputedStyle(sidebar);
      const padding = parseFloat(computed.paddingTop || '0') +
        parseFloat(computed.paddingBottom || '0');
      const availableHeight = Math.max(240, grid.clientHeight - padding - 4);

      // Always use the readable two-column selector from the approved design.
      sidebar.dataset.density = 'compact';
      content.style.zoom = '1';
      content.style.width = '100%';
      content.style.transform = '';
      const unscaledHeight = Math.max(1, content.scrollHeight);
      let ratio = Math.min(1, availableHeight / unscaledHeight);
      content.style.zoom = String(ratio);

      // Browser font metrics and wrapped labels can affect the final height.
      // Recheck actual rendered geometry rather than cropping the bottom row.
      for (let attempt = 0; attempt < 3; attempt++) {
        const actualHeight = content.getBoundingClientRect().height;
        if (actualHeight <= availableHeight + 1) break;
        ratio *= availableHeight / actualHeight;
        content.style.zoom = String(ratio);
      }
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(grid);
    const mutation = new MutationObserver(schedule);
    mutation.observe(content, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return { sidebarRef, sidebarContentRef };
}
