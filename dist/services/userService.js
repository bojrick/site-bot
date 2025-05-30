"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = require("../utils/crypto");
const whatsapp_1 = require("./whatsapp");
class UserService {
    async getOrCreateUser(phone) {
        // Try to find existing user
        let user = await this.getUserByPhone(phone);
        if (!user) {
            // Create new user as customer by default
            user = await this.createUser(phone, 'customer');
        }
        return user;
    }
    async getUserByPhone(phone) {
        const result = await (0, db_1.getDb)()
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.phone, phone))
            .limit(1);
        return result[0] || null;
    }
    async createUser(phone, role, name) {
        const newUser = {
            phone,
            role,
            name: name || null,
            is_verified: role === 'customer', // Customers are auto-verified, employees need OTP
            verified_at: role === 'customer' ? new Date() : null,
        };
        const result = await (0, db_1.getDb)()
            .insert(schema_1.users)
            .values(newUser)
            .returning();
        console.log(`✅ Created new ${role}: ${phone}`);
        return result[0];
    }
    async updateUser(phone, updates) {
        await (0, db_1.getDb)()
            .update(schema_1.users)
            .set({ ...updates, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.users.phone, phone));
    }
    async verifyEmployee(phone) {
        await (0, db_1.getDb)()
            .update(schema_1.users)
            .set({
            is_verified: true,
            verified_at: new Date(),
            updated_at: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.phone, phone));
    }
    // OTP Management for Employees
    async generateAndSendOTP(phone) {
        try {
            // Delete any existing OTP
            await this.deleteOTP(phone);
            // Generate new OTP
            const otp = (0, crypto_1.generateOTP)();
            const otpHash = await (0, crypto_1.hashOTP)(otp);
            const expiresAt = (0, crypto_1.getOTPExpiry)(10); // 10 minutes
            // Store OTP in database
            await (0, db_1.getDb)().insert(schema_1.employee_otps).values({
                phone,
                otp_hash: otpHash,
                attempts: 0,
                expires_at: expiresAt,
            });
            // Send OTP via WhatsApp
            const message = `🔐 Your verification code is: ${otp}\n\nThis code will expire in 10 minutes. Please enter this code to verify your employee account.`;
            const sent = await whatsapp_1.whatsappService.sendTextMessage(phone, message);
            if (sent) {
                console.log(`📲 OTP sent to ${phone}`);
                return true;
            }
            else {
                console.error(`❌ Failed to send OTP to ${phone}`);
                await this.deleteOTP(phone);
                return false;
            }
        }
        catch (error) {
            console.error('Error generating OTP:', error);
            return false;
        }
    }
    async verifyOTPCode(phone, otpCode) {
        try {
            // Get stored OTP
            const storedOTP = await (0, db_1.getDb)()
                .select()
                .from(schema_1.employee_otps)
                .where((0, drizzle_orm_1.eq)(schema_1.employee_otps.phone, phone))
                .limit(1);
            if (!storedOTP.length) {
                return { success: false, message: 'No OTP found. Please request a new one.' };
            }
            const otp = storedOTP[0];
            // Check if expired
            if ((0, crypto_1.isOTPExpired)(otp.expires_at)) {
                await this.deleteOTP(phone);
                return { success: false, message: 'OTP has expired. Please request a new one.' };
            }
            // Check attempts
            if ((otp.attempts || 0) >= 3) {
                await this.deleteOTP(phone);
                return { success: false, message: 'Too many attempts. Please request a new OTP.' };
            }
            // Verify OTP
            const isValid = await (0, crypto_1.verifyOTP)(otpCode, otp.otp_hash);
            if (isValid) {
                // OTP is correct - verify user and delete OTP
                await this.verifyEmployee(phone);
                await this.deleteOTP(phone);
                return { success: true, message: 'Successfully verified! Welcome to the employee portal.' };
            }
            else {
                // Increment attempts
                await (0, db_1.getDb)()
                    .update(schema_1.employee_otps)
                    .set({ attempts: (otp.attempts || 0) + 1 })
                    .where((0, drizzle_orm_1.eq)(schema_1.employee_otps.phone, phone));
                const attemptsLeft = 3 - ((otp.attempts || 0) + 1);
                return {
                    success: false,
                    message: `Invalid OTP. ${attemptsLeft} attempts remaining.`
                };
            }
        }
        catch (error) {
            console.error('Error verifying OTP:', error);
            return { success: false, message: 'Error verifying OTP. Please try again.' };
        }
    }
    async deleteOTP(phone) {
        await (0, db_1.getDb)()
            .delete(schema_1.employee_otps)
            .where((0, drizzle_orm_1.eq)(schema_1.employee_otps.phone, phone));
    }
    async hasActiveOTP(phone) {
        const result = await (0, db_1.getDb)()
            .select()
            .from(schema_1.employee_otps)
            .where((0, drizzle_orm_1.eq)(schema_1.employee_otps.phone, phone))
            .limit(1);
        if (!result.length)
            return false;
        const otp = result[0];
        if ((0, crypto_1.isOTPExpired)(otp.expires_at)) {
            await this.deleteOTP(phone);
            return false;
        }
        return true;
    }
}
exports.UserService = UserService;
//# sourceMappingURL=userService.js.map