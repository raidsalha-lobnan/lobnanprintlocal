/**
 * Global Keyboard Shortcut Matching Utility
 * Handles modifiers (Ctrl, Alt, Shift, Cmd/Meta) and multi-language keyboard layouts (Arabic / English / e.code)
 */

const ARABIC_TO_ENGLISH_KEY_MAP: Record<string, string> = {
  'س': 'S',
  'ش': 'A',
  'ي': 'D',
  'ب': 'F',
  'ل': 'G',
  'ا': 'H',
  'ت': 'J',
  'ن': 'K',
  'م': 'L',
  'ك': ';',
  'ط': "'",
  'ئ': 'Z',
  'ء': 'X',
  'ؤ': 'C',
  'ر': 'V',
  'لا': 'B',
  'ى': 'N',
  'ة': 'M',
  'و': ',',
  'ز': '.',
  'ظ': '/',
  'ض': 'Q',
  'ص': 'W',
  'ث': 'E',
  'ق': 'R',
  'ف': 'T',
  'غ': 'Y',
  'ع': 'U',
  'ه': 'I',
  'خ': 'O',
  'ح': 'P',
  'ج': '[',
  'د': ']'
};

export function matchKeyboardShortcut(e: KeyboardEvent, shortcutStr?: string): boolean {
  if (!shortcutStr || !shortcutStr.trim()) return false;

  const parts = shortcutStr
    .trim()
    .split('+')
    .map(p => p.trim().toUpperCase());
  if (parts.length === 0) return false;

  const requiresCtrl = parts.includes('CTRL') || parts.includes('CONTROL');
  const requiresAlt = parts.includes('ALT');
  const requiresShift = parts.includes('SHIFT');
  const requiresMeta =
    parts.includes('CMD') || parts.includes('COMMAND') || parts.includes('META') || parts.includes('WIN');

  const actualCtrl = e.ctrlKey || (requiresCtrl && e.metaKey);
  const actualAlt = e.altKey;
  const actualShift = e.shiftKey;

  if (requiresCtrl !== (e.ctrlKey || e.metaKey)) return false;
  if (requiresAlt !== actualAlt) return false;
  if (requiresShift !== actualShift) return false;

  // Extract the target key
  const keyPart =
    parts.find(
      p => !['CTRL', 'CONTROL', 'ALT', 'SHIFT', 'CMD', 'COMMAND', 'META', 'WIN'].includes(p)
    ) || '';

  if (!keyPart) return false;

  const eventKeyUpper = (e.key || '').toUpperCase();
  const eventCodeUpper = (e.code || '').toUpperCase();

  // 1. Direct match
  if (
    eventKeyUpper === keyPart ||
    eventCodeUpper === keyPart ||
    eventCodeUpper === `KEY${keyPart}` ||
    eventCodeUpper === `DIGIT${keyPart}` ||
    eventCodeUpper === `NUMPAD${keyPart}` ||
    (keyPart === 'C' && (eventKeyUpper === 'Ç' || eventKeyUpper === 'ؤ' || eventCodeUpper === 'KEYC'))
  ) {
    return true;
  }

  // 2. Arabic letter to English key code conversion
  if (e.key && ARABIC_TO_ENGLISH_KEY_MAP[e.key] === keyPart) {
    return true;
  }

  // 3. Special aliases (e.g., ENTER, ESC, ESCAPE, SPACE)
  if (keyPart === 'ESC' && (eventKeyUpper === 'ESCAPE' || eventCodeUpper === 'ESCAPE')) return true;
  if (keyPart === 'RETURN' && (eventKeyUpper === 'ENTER' || eventCodeUpper === 'ENTER')) return true;
  if (keyPart === 'SPACE' && (eventKeyUpper === ' ' || eventCodeUpper === 'SPACE')) return true;

  return false;
}
