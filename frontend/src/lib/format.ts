/**
 * Format currency amount with correct locale for currency symbol
 */
export function formatCurrency(amount: number, currency: string = 'AUD'): string {
  // Map currencies to their appropriate locales for correct symbol display
  const localeMap: Record<string, string> = {
    'AUD': 'en-AU',
    'USD': 'en-US',
    'EUR': 'en-GB',
    'GBP': 'en-GB',
    'INR': 'en-IN',  // Use Indian locale for ₹ symbol
    'SGD': 'en-SG',
    'NZD': 'en-NZ',
    'JPY': 'ja-JP',
    'CNY': 'zh-CN',
    'HKD': 'zh-HK',
    'THB': 'th-TH',
    'MYR': 'ms-MY',
    'IDR': 'id-ID',
    'PHP': 'en-PH',
    'VND': 'vi-VN',
  };

  const locale = localeMap[currency] || 'en-US';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date, format: 'short' | 'long' | 'full' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    short: { day: 'numeric', month: 'short' },
    long: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
    full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  }[format];
  
  return d.toLocaleDateString('en-AU', options);
}

/**
 * Format time for display
 */
export function formatTime(time: string): string {
  // Assuming time is in HH:mm format
  return time;
}

/**
 * Format duration
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}m`;
  }
  
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format passenger type
 */
export function formatPassengerType(type: 'ADT' | 'CHD' | 'INF'): string {
  const labels = {
    ADT: 'Adult',
    CHD: 'Child',
    INF: 'Infant',
  };
  return labels[type] || type;
}
