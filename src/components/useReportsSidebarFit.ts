import { useLayoutEffect, useRef } from 'react';

/**
 * Fit every sidebar option into the actual available panel height.
 * Use a compact grid on short panels, then scale the full content only
 * when necessary. Nothing is hidden, truncated, or made scroll-dependent.
 */
export function useReportsSidebarFit() {
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const content = sidebarContentRef.current;
    if (!sidebar || !content) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(sidebar);
      const height = sidebar.clientHeight -
        parseFloat(style.paddingTop || '0') -
        parseFloat(style.paddingBottom || '0');

      sidebar.dataset.density = height < 760 ? 'compact' : 'normal';
      content.style.transform = '';
      content.style.width = '100%';
      const naturalHeight = content.scrollHeight;
      const scale = Math.min(1, Math.max(0.2, (height - 3) / Math.max(1, naturalHeight)));
      // The extra logical width exactly offsets the scaled display width.
      content.style.width = String(100 / scale) + '%';
      content.style.transform = 'scale(' + scale + ')';
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const resize = new ResizeObserver(schedule);
    resize.observe(sidebar);
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
