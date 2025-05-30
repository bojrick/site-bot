export declare function generateOTP(): string;
export declare function hashOTP(otp: string): Promise<string>;
export declare function verifyOTP(otp: string, hash: string): Promise<boolean>;
export declare function getOTPExpiry(minutes?: number): Date;
export declare function isOTPExpired(expiryTime: Date): boolean;
//# sourceMappingURL=crypto.d.ts.map