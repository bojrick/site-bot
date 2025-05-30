// Normalize phone number to E.164 format
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If starts with country code, return as is
  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }
  
  // If 10 digits, assume Indian number and add country code
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  
  // If already has + prefix, return as is
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Default: add + if missing
  return `+${digits}`;
}

// Validate phone number format
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Basic validation for E.164 format
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(normalized);
}

// Extract phone number from WhatsApp webhook data
export function extractPhoneFromWebhook(webhookData: any): string | null {
  try {
    const phone = webhookData.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
    return phone ? normalizePhoneNumber(phone) : null;
  } catch (error) {
    console.error('Error extracting phone from webhook:', error);
    return null;
  }
}

// Format phone for display (hide middle digits)
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length >= 8) {
    const start = normalized.substring(0, 3);
    const end = normalized.substring(normalized.length - 2);
    const middle = '*'.repeat(normalized.length - 5);
    return `${start}${middle}${end}`;
  }
  return normalized;
} 