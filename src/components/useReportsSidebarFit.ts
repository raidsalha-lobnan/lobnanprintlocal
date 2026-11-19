import { useLayoutEffect, useRef } from 'react';

/**
 * Keep the reports sidebar at its original width while using readable,
 * full-size text. Never shrink the entire sidebar with CSS zoom.
 * If the content exceeds the available viewport height, the sidebar itself
 * scrolls vertically rather than hiding controls or widening the preview.
 */
export function useReportsSidebarFit() {
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const content = sidebarContentRef.current;
    if (!sidebar || !content) return;

    sidebar.dataset.density = 'readable';
    content.style.zoom = '1';
    content.style.width = '100%';
    content.style.transform = '';
  }, []);

  return { sidebarRef, sidebarContentRef };
}
