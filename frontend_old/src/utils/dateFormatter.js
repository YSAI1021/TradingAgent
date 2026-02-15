/**
 * Date formatting utilities with timezone support
 */

/**
 * Format a date with timezone support
 * @param {string|Date} date - The date to format
 * @param {string} timezone - The timezone to display ('local', 'America/New_York')
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDate = (date, timezone = 'local', options = {}) => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };

  let formattedDate;

  // If timezone is 'local', use default behavior (user's system timezone)
  if (timezone === 'local') {
    formattedDate = dateObj.toLocaleString('en-US', defaultOptions);
  } else {
    // Otherwise, use the specified timezone
    formattedDate = dateObj.toLocaleString('en-US', {
      ...defaultOptions,
      timeZone: timezone
    });
  }

  // Add timezone abbreviation at the end
  const tzAbbr = getTimezoneAbbr(timezone);
  return `${formattedDate} ${tzAbbr}`;
};

/**
 * Format a date as date-only (no time)
 * @param {string|Date} date - The date to format
 * @param {string} timezone - The timezone to display
 * @returns {string} Formatted date string
 */
export const formatDateOnly = (date, timezone = 'local') => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  };

  if (timezone === 'local') {
    return dateObj.toLocaleDateString('en-US', options);
  }

  return dateObj.toLocaleDateString('en-US', {
    ...options,
    timeZone: timezone
  });
};

/**
 * Format a date as short format (e.g., "Nov 25")
 * @param {string|Date} date - The date to format
 * @param {string} timezone - The timezone to display
 * @returns {string} Formatted date string
 */
export const formatShortDate = (date, timezone = 'local') => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  const options = {
    month: 'short',
    day: 'numeric'
  };

  if (timezone === 'local') {
    return dateObj.toLocaleDateString('en-US', options);
  }

  return dateObj.toLocaleDateString('en-US', {
    ...options,
    timeZone: timezone
  });
};

/**
 * Format a date as relative time (e.g., "5m ago", "2h ago")
 * @param {string|Date} date - The date to format
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (date) => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  const now = new Date();
  const diffMs = now - dateObj;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return dateObj.toLocaleDateString();
};

/**
 * Format a date for ISO input (YYYY-MM-DD)
 * @param {string|Date} date - The date to format
 * @returns {string} ISO date string
 */
export const formatISODate = (date = new Date()) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  return dateObj.toISOString().split('T')[0];
};

/**
 * Get timezone abbreviation
 * @param {string} timezone - The timezone identifier
 * @returns {string} Timezone abbreviation
 */
export const getTimezoneAbbr = (timezone) => {
  if (timezone === 'local') {
    const date = new Date();
    const timeStr = date.toLocaleTimeString('en-US', { timeZoneName: 'short' });
    const match = timeStr.match(/\b([A-Z]{3,5})\b/);
    return match ? match[1] : 'Local';
  }

  if (timezone === 'America/New_York') {
    const date = new Date();
    const timeStr = date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const match = timeStr.match(/\b([A-Z]{3,5})\b/);
    return match ? match[1] : 'EST';
  }

  return timezone;
};
