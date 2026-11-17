/**
 * Delegate statement PDF output to Chrome's REAL print engine. Canvas
 * screenshots are not text/shaping-equivalent to @media print and can omit
 * deferred attachment images in long reports.
 *
 * Normal websites cannot silently choose a PDF printer or write to the
 * user's Downloads directory. The operator chooses "Save as PDF" in the
 * browser print dialog. For Chrome, document.title suggests the filename.
 *
 * This function must run synchronously in the click handler to retain the
 * browser's print user activation.
 */
export function printStatementWithNativeBrowser(
  filename: string,
  printAction: () => void = () => window.print()
): void {
  const originalTitle = document.title;
  const proposedTitle = filename.replace(/\.pdf$/i, '').trim();
  if (!proposedTitle) throw new Error('STATEMENT_PDF_FILENAME_REQUIRED');

  let restored = false;
  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    window.removeEventListener('afterprint', restoreTitle);
    // Do not clobber a newer document title from subsequent navigation.
    if (document.title === proposedTitle) document.title = originalTitle;
  };

  window.addEventListener('afterprint', restoreTitle, { once: true });
  document.title = proposedTitle;
  try {
    // The SAME print function used by "طباعة التقرير" or "طباعة A4".
    printAction();
  } catch (error) {
    restoreTitle();
    throw error;
  }
}
