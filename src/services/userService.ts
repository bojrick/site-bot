import { getDb } from '../db';
import { users, employee_otps } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateOTP, hashOTP, verifyOTP, getOTPExpiry, isOTPExpired } from '../utils/crypto';
import { whatsappService } from './whatsapp';

export class UserService {
  
  async getOrCreateUser(phone: string) {
    // Try to find existing user
    let user = await this.getUserByPhone(phone);
    
    if (!user) {
      // Create new user as customer by default
      user = await this.createUser(phone, 'customer');
    }
    
    return user;
  }

  async getUserByPhone(phone: string) {
    const result = await getDb()
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    
    return result[0] || null;
  }

  async createUser(phone: string, role: 'employee' | 'customer', name?: string) {
    const newUser = {
      phone,
      role,
      name: name || null,
      is_verified: role === 'customer', // Customers are auto-verified, employees need OTP
      verified_at: role === 'customer' ? new Date() : null,
    };

    const result = await getDb()
      .insert(users)
      .values(newUser)
      .returning();

    console.log(`✅ Created new ${role}: ${phone}`);
    return result[0];
  }

  async updateUser(phone: string, updates: Partial<typeof users.$inferInsert>) {
    await getDb()
      .update(users)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(users.phone, phone));
  }

  async verifyEmployee(phone: string) {
    await getDb()
      .update(users)
      .set({ 
        is_verified: true, 
        verified_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(users.phone, phone));
  }

  // OTP Management for Employees
  async generateAndSendOTP(phone: string): Promise<boolean> {
    try {
      // Delete any existing OTP
      await this.deleteOTP(phone);
      
      // Generate new OTP
      const otp = generateOTP();
      const otpHash = await hashOTP(otp);
      const expiresAt = getOTPExpiry(10); // 10 minutes

      // Store OTP in database
      await getDb().insert(employee_otps).values({
        phone,
        otp_hash: otpHash,
        attempts: 0,
        expires_at: expiresAt,
      });

      // Send OTP via WhatsApp
      const message = `🔐 Your verification code is: ${otp}\n\nThis code will expire in 10 minutes. Please enter this code to verify your employee account.`;
      
      const sent = await whatsappService.sendTextMessage(phone, message);
      
      if (sent) {
        console.log(`📲 OTP sent to ${phone}`);
        return true;
      } else {
        console.error(`❌ Failed to send OTP to ${phone}`);
        await this.deleteOTP(phone);
        return false;
      }
    } catch (error) {
      console.error('Error generating OTP:', error);
      return false;
    }
  }

  async verifyOTPCode(phone: string, otpCode: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get stored OTP
      const storedOTP = await getDb()
        .select()
        .from(employee_otps)
        .where(eq(employee_otps.phone, phone))
        .limit(1);

      if (!storedOTP.length) {
        return { success: false, message: 'No OTP found. Please request a new one.' };
      }

      const otp = storedOTP[0];

      // Check if expired
      if (isOTPExpired(otp.expires_at)) {
        await this.deleteOTP(phone);
        return { success: false, message: 'OTP has expired. Please request a new one.' };
      }

      // Check attempts
      if ((otp.attempts || 0) >= 3) {
        await this.deleteOTP(phone);
        return { success: false, message: 'Too many attempts. Please request a new OTP.' };
      }

      // Verify OTP
      const isValid = await verifyOTP(otpCode, otp.otp_hash);

      if (isValid) {
        // OTP is correct - verify user and delete OTP
        await this.verifyEmployee(phone);
        await this.deleteOTP(phone);
        return { success: true, message: 'Successfully verified! Welcome to the employee portal.' };
      } else {
        // Increment attempts
        await getDb()
          .update(employee_otps)
          .set({ attempts: (otp.attempts || 0) + 1 })
          .where(eq(employee_otps.phone, phone));

        const attemptsLeft = 3 - ((otp.attempts || 0) + 1);
        return { 
          success: false, 
          message: `Invalid OTP. ${attemptsLeft} attempts remaining.` 
        };
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return { success: false, message: 'Error verifying OTP. Please try again.' };
    }
  }

  async deleteOTP(phone: string) {
    await getDb()
      .delete(employee_otps)
      .where(eq(employee_otps.phone, phone));
  }

  async hasActiveOTP(phone: string): Promise<boolean> {
    const result = await getDb()
      .select()
      .from(employee_otps)
      .where(eq(employee_otps.phone, phone))
      .limit(1);

    if (!result.length) return false;

    const otp = result[0];
    if (isOTPExpired(otp.expires_at)) {
      await this.deleteOTP(phone);
      return false;
    }

    return true;
  }
} 