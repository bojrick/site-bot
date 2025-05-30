import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// Generate a 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash OTP for secure storage
export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, SALT_ROUNDS);
}

// Verify OTP against hash
export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// Generate OTP expiry time (default 10 minutes)
export function getOTPExpiry(minutes: number = 10): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + minutes);
  return expiry;
}

// Check if OTP has expired
export function isOTPExpired(expiryTime: Date): boolean {
  return new Date() > expiryTime;
} 