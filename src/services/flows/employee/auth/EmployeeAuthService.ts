import { whatsappService } from '../../../whatsapp';
import { UserService } from '../../../userService';

export class EmployeeAuthService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Check if user needs verification
   */
  needsVerification(user: any, isAdminImpersonation: boolean = false): boolean {
    // Admin impersonation bypasses verification
    if (isAdminImpersonation) {
      return false;
    }

    // Regular employees need verification if not verified
    return !user.is_verified && user.role === 'employee';
  }

  /**
   * Handle employee verification flow
   */
  async handleVerification(user: any, phone: string, messageText: string): Promise<{ verified: boolean; shouldContinue: boolean }> {
    const text = messageText.trim();

    // Handle OTP submission
    if (/^\d{6}$/.test(text)) {
      return await this.handleOTPSubmission(phone, text);
    }

    // Handle OTP requests/resend
    if (this.isOTPRequest(text)) {
      await this.handleOTPRequest(phone);
      return { verified: false, shouldContinue: false };
    }

    // First time employee - auto-send OTP
    await this.sendInitialOTP(phone);
    return { verified: false, shouldContinue: false };
  }

  /**
   * Handle OTP code submission
   */
  private async handleOTPSubmission(phone: string, otpCode: string): Promise<{ verified: boolean; shouldContinue: boolean }> {
    try {
      const result = await this.userService.verifyOTPCode(phone, otpCode);
      
      if (result.success) {
        await whatsappService.sendTextMessage(phone, 
          `✅ ${result.message}\n\n🎉 કર્મચારી પોર્ટલમાં આપનું સ્વાગત છે! સાઈટ પસંદ કરી રહ્યા છીએ...`
        );
        return { verified: true, shouldContinue: true };
      } else {
        await whatsappService.sendTextMessage(phone, `❌ ${result.message}`);
        await this.promptForOTP(phone);
        return { verified: false, shouldContinue: false };
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ વેરિફિકેશનમાં ભૂલ. કૃપા કરીને ફરીથી પ્રયાસ કરો."
      );
      return { verified: false, shouldContinue: false };
    }
  }

  /**
   * Handle OTP request/resend
   */
  private async handleOTPRequest(phone: string): Promise<void> {
    try {
      // Check if there's already an active OTP (rate limiting)
      const hasActiveOTP = await this.userService.hasActiveOTP(phone);
      
      if (hasActiveOTP) {
        await whatsappService.sendTextMessage(phone, 
          "⏰ કૃપા કરીને 1 મિનિટ રાહ જુઓ, પછી નવો OTP મંગાવો."
        );
        return;
      }

      // Send new OTP
      const sent = await this.userService.generateAndSendOTP(phone);
      
      if (sent) {
        await whatsappService.sendTextMessage(phone, 
          "📲 નવો OTP મોકલ્યો છે! કૃપા કરીને 6-અંકનો કોડ દાખલ કરો:"
        );
      } else {
        await whatsappService.sendTextMessage(phone, 
          "❌ OTP મોકલવામાં નિષ્ફળ. કૃપા કરીને પછીથી પ્રયાસ કરો."
        );
      }
    } catch (error) {
      console.error('Error handling OTP request:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ OTP મોકલવામાં ભૂલ. કૃપા કરીને પછીથી પ્રયાસ કરો."
      );
    }
  }

  /**
   * Send initial OTP to new employee
   */
  private async sendInitialOTP(phone: string): Promise<void> {
    try {
      // Check if OTP already sent
      const hasActiveOTP = await this.userService.hasActiveOTP(phone);
      
      if (!hasActiveOTP) {
        const sent = await this.userService.generateAndSendOTP(phone);
        
        if (sent) {
          const message = `👋 *કર્મચારી પોર્ટલમાં આપનું સ્વાગત છે!*

🔐 સુરક્ષા માટે, કૃપા કરીને તમારું એકાઉન્ટ વેરિફાઈ કરો. 

📲 મેં તમને 6-અંકનો વેરિફિકેશન કોડ મોકલ્યો છે.

આગળ વધવા માટે કૃપા કરીને કોડ દાખલ કરો:`;

          await whatsappService.sendTextMessage(phone, message);
        } else {
          await whatsappService.sendTextMessage(phone, 
            "❌ વેરિફિકેશન કોડ મોકલવામાં ભૂલ. કૃપા કરીને પછીથી પ્રયાસ કરો."
          );
        }
      } else {
        await this.promptForOTP(phone);
      }
    } catch (error) {
      console.error('Error sending initial OTP:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ વેરિફિકેશન પ્રક્રિયામાં ભૂલ. કૃપા કરીને પછીથી પ્રયાસ કરો."
      );
    }
  }

  /**
   * Prompt user to enter OTP
   */
  private async promptForOTP(phone: string): Promise<void> {
    const message = `🔐 *કૃપા કરીને તમારો 6-અંકનો વેરિફિકેશન કોડ દાખલ કરો*

📲 જો કોડ ન મળ્યો હોય તો:
• 'resend' ટાઈપ કરો નવો કોડ મેળવવા
• 'otp' ટાઈપ કરો કોડ ફરીથી મંગાવવા`;

    await whatsappService.sendTextMessage(phone, message);
  }

  /**
   * Check if message is an OTP request
   */
  private isOTPRequest(text: string): boolean {
    const lowerText = text.toLowerCase();
    return lowerText.includes('otp') || 
           lowerText.includes('resend') || 
           lowerText.includes('code') ||
           lowerText.includes('કોડ');
  }

  /**
   * Send welcome message after successful verification
   */
  async sendVerificationSuccessMessage(phone: string): Promise<void> {
    const message = `🎉 *વેરિફિકેશન સફળ!*

✅ તમારું એકાઉન્ટ સફળતાપૂર્વક વેરિફાઈ થઈ ગયું છે.

🚀 હવે તમે કર્મચારી પોર્ટલની બધી સુવિધાઓનો ઉપયોગ કરી શકો છો.

📍 આગળ વધવા માટે તમારી સાઈટ પસંદ કરો...`;

    await whatsappService.sendTextMessage(phone, message);
  }
} 