/** Date utility helpers (no external library needed). */

/** @returns {string} Today as YYYY-MM-DD (local time) */
export function todayISO() {
  const d = new Date();
  return _toISO(d);
}

/**
 * Return a date N years before today as YYYY-MM-DD.
 * @param {number} years
 */
export function yearsAgoISO(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return _toISO(d);
}

/**
 * Return a date N days before today as YYYY-MM-DD.
 * @param {number} days
 */
export function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return _toISO(d);
}

/**
 * Convert a YYYY-MM-DD string or Date to a local Date object.
 * @param {string|Date} value
 * @returns {Date}
 */
export function parseDate(value) {
  if (value instanceof Date) return value;
  // Parse as UTC midnight then convert to display correctly
  return new Date(value + 'T00:00:00');
}

/** @param {Date} d */
function _toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
