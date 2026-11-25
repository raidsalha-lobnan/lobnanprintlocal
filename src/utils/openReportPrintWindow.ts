/** Only locally generated report windows receive the desktop print permission. */
export function openReportPrintWindow(): Window | null {
  const name='lobnan-print-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  return window.open('',name);
}
