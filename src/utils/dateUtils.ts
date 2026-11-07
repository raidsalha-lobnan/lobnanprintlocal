export const formatDateDisplay = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  
  // Normalize separation to '-'
  const normalized = cleanDate.replace(/[\/\.]/g, '-');
  const parts = normalized.split('-');
  
  if (parts.length === 3) {
    let day = '';
    let month = '';
    let year = '';
    
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      day = parts[0];
      month = parts[1];
      year = parts[2];
    } else {
      // Unrecognized structure but has 3 parts
      return cleanDate;
    }
    
    // Ensure 2 digits for day and month
    const dStr = day.padStart(2, '0');
    const mStr = month.padStart(2, '0');
    return `${dStr}/${mStr}/${year}`;
  }
  return dateStr;
};

export const getTodayDateString = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};
