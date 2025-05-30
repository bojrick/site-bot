import { users } from '../db/schema';
export declare class UserService {
    getOrCreateUser(phone: string): Promise<{
        id: string;
        name: string | null;
        phone: string;
        role: "employee" | "customer";
        email: string | null;
        is_verified: boolean | null;
        verified_at: Date | null;
        created_at: Date | null;
        updated_at: Date | null;
    }>;
    getUserByPhone(phone: string): Promise<{
        id: string;
        name: string | null;
        phone: string;
        role: "employee" | "customer";
        email: string | null;
        is_verified: boolean | null;
        verified_at: Date | null;
        created_at: Date | null;
        updated_at: Date | null;
    }>;
    createUser(phone: string, role: 'employee' | 'customer', name?: string): Promise<{
        id: string;
        name: string | null;
        phone: string;
        role: "employee" | "customer";
        email: string | null;
        is_verified: boolean | null;
        verified_at: Date | null;
        created_at: Date | null;
        updated_at: Date | null;
    }>;
    updateUser(phone: string, updates: Partial<typeof users.$inferInsert>): Promise<void>;
    verifyEmployee(phone: string): Promise<void>;
    generateAndSendOTP(phone: string): Promise<boolean>;
    verifyOTPCode(phone: string, otpCode: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteOTP(phone: string): Promise<void>;
    hasActiveOTP(phone: string): Promise<boolean>;
}
//# sourceMappingURL=userService.d.ts.map