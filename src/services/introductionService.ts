import { getDb } from '../db';
import { users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { WhatsAppService } from './whatsapp';

const whatsappService = new WhatsAppService();

export class IntroductionService {
  
  /**
   * Send introduction message to a new employee
   */
  async sendIntroductionMessage(phone: string): Promise<boolean> {
    try {
      // Get user details
      const user = await getDb()
        .select()
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);

      if (user.length === 0) {
        console.log(`❌ User not found: ${phone}`);
        return false;
      }

      const userData = user[0];

      // Check if introduction message was already sent
      if (userData.introduction_sent) {
        console.log(`ℹ️ Introduction message already sent to: ${phone}`);
        return true;
      }

      // Only send to employees
      if (userData.role !== 'employee') {
        console.log(`ℹ️ Not sending introduction to non-employee: ${phone} (role: ${userData.role})`);
        return false;
      }

      // Prepare the introduction message
      const userName = userData.name || 'કર્મચારી મિત્ર';
      const introductionMessage = this.getIntroductionMessage(userName);

      // Send the WhatsApp message
      const messageSent = await whatsappService.sendTextMessage(phone, introductionMessage);

      if (messageSent) {
        // Update the database to mark introduction as sent
        await getDb()
          .update(users)
          .set({
            introduction_sent: true,
            introduction_sent_at: new Date(),
            updated_at: new Date()
          })
          .where(eq(users.phone, phone));

        console.log(`✅ Introduction message sent successfully to: ${phone}`);
        return true;
      } else {
        console.log(`❌ Failed to send introduction message to: ${phone}`);
        return false;
      }

    } catch (error) {
      console.error('Error sending introduction message:', error);
      return false;
    }
  }

  /**
   * Send introduction messages to all employees who haven't received them
   */
  async sendPendingIntroductionMessages(): Promise<{ sent: number; failed: number }> {
    try {
      // Get all employees who haven't received introduction messages
      const pendingEmployees = await getDb()
        .select()
        .from(users)
        .where(
          and(
            eq(users.role, 'employee'),
            eq(users.introduction_sent, false)
          )
        );

      console.log(`📋 Found ${pendingEmployees.length} employees pending introduction messages`);

      let sent = 0;
      let failed = 0;

      for (const employee of pendingEmployees) {
        const success = await this.sendIntroductionMessage(employee.phone);
        if (success) {
          sent++;
        } else {
          failed++;
        }
        
        // Add a small delay between messages to avoid rate limiting
        await this.delay(1000);
      }

      console.log(`📊 Introduction messages summary: ${sent} sent, ${failed} failed`);
      return { sent, failed };

    } catch (error) {
      console.error('Error sending pending introduction messages:', error);
      return { sent: 0, failed: 0 };
    }
  }

  /**
   * Get the introduction message template
   */
  private getIntroductionMessage(userName: string): string {
    return `🎉 *કર્મચારી પોર્ટલમાં આપનું સ્વાગત છે!*

નમસ્તે ${userName}! 

તમને અમારી કંપનીના કર્મચારી પોર્ટલમાં ઉમેરવામાં આવ્યું છે. આ પોર્ટલ દ્વારા તમે:

🔹 *દૈનિક કામની નોંધ* કરી શકશો
🔹 *સામગ્રીની માંગ* કરી શકશો  
🔹 *ઇન્વૉઇસ ટ્રેકિંગ* કરી શકશો
🔹 *પ્રોજેક્ટની માહિતી* મેળવી શકશો

*શરૂઆત કરવા માટે:*
1. આ નંબર પર "Hi" મેસેજ મોકલો
2. OTP વેરિફિકેશન પૂર્ણ કરો
3. તમારી સાઈટ પસંદ કરો

📞 *સહાય માટે સંપર્ક:* આ જ નંબર પર મેસેજ કરો

તમારા સહકાર બદલ આભાર! 🙏

---
*Suvasam Group* 🏢`;
  }

  /**
   * Check if introduction message was sent to a user
   */
  async isIntroductionSent(phone: string): Promise<boolean> {
    try {
      const result = await getDb()
        .select({ introduction_sent: users.introduction_sent })
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);

      return result.length > 0 ? result[0].introduction_sent || false : false;
    } catch (error) {
      console.error('Error checking introduction status:', error);
      return false;
    }
  }

  /**
   * Reset introduction status for an employee (for testing or resending)
   */
  async resetIntroductionStatus(phone: string): Promise<boolean> {
    try {
      await getDb()
        .update(users)
        .set({
          introduction_sent: false,
          introduction_sent_at: null,
          updated_at: new Date()
        })
        .where(eq(users.phone, phone));

      console.log(`🔄 Reset introduction status for: ${phone}`);
      return true;
    } catch (error) {
      console.error('Error resetting introduction status:', error);
      return false;
    }
  }

  /**
   * Utility function to add delay between operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const introductionService = new IntroductionService(); 