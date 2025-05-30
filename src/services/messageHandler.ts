import { getDb } from '../db';
import { users, sessions, employee_otps, message_logs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { whatsappService, ImageMessage } from './whatsapp';
import { UserService } from './userService';
import { EmployeeFlow } from './flows/employeeFlow';
import { CustomerFlow } from './flows/customerFlow';
import { normalizePhoneNumber } from '../utils/phone';

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
  image?: ImageMessage;
}

export class MessageHandler {
  private userService: UserService;
  private employeeFlow: EmployeeFlow;
  private customerFlow: CustomerFlow;

  constructor() {
    this.userService = new UserService();
    this.employeeFlow = new EmployeeFlow();
    this.customerFlow = new CustomerFlow();
  }

  async handleMessage(phone: string, message: WhatsAppMessage): Promise<void> {
    try {
      const normalizedPhone = normalizePhoneNumber(phone);
      
      // Log the message
      await this.logMessage(normalizedPhone, 'inbound', message);

      // Mark message as read
      await whatsappService.markAsRead(message.id);

      // Get or create user
      const user = await this.userService.getOrCreateUser(normalizedPhone);
      
      // Get or create session
      let session = await this.getSession(normalizedPhone);
      if (!session) {
        session = await this.createSession(normalizedPhone);
      }

      // Extract message content
      const messageText = this.extractMessageText(message);
      const interactiveData = message.interactive;
      const imageData = message.image;

      console.log(`👤 User: ${user.role}, Phone: ${normalizedPhone}`);
      console.log(`💬 Message: "${messageText}"`);
      console.log(`📸 Has Image: ${!!imageData}`);
      console.log(`🎯 Session: ${session.intent || 'none'}, Step: ${session.step || 'none'}`);

      // Route to appropriate flow based on user role
      if (user.role === 'employee') {
        await this.employeeFlow.handleMessage(
          user, 
          session, 
          messageText, 
          interactiveData,
          imageData
        );
      } else {
        await this.customerFlow.handleMessage(
          user, 
          session, 
          messageText, 
          interactiveData
        );
      }

    } catch (error) {
      console.error('❌ Error in message handler:', error);
      
      // Send error message to user (in Gujarati for employees)
      const user = await this.userService.getUserByPhone(normalizePhoneNumber(phone));
      const errorMessage = user?.role === 'employee' 
        ? "માફ કરશો, તમારા મેસેજને પ્રોસેસ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા મદદ માટે 'મદદ' ટાઈપ કરો."
        : "Sorry, I encountered an error processing your message. Please try again or type 'help' for assistance.";
      
      await whatsappService.sendTextMessage(
        normalizePhoneNumber(phone),
        errorMessage
      );
    }
  }

  private extractMessageText(message: WhatsAppMessage): string {
    if (message.text?.body) {
      return message.text.body.trim();
    }
    
    if (message.interactive?.button_reply) {
      return message.interactive.button_reply.id;
    }
    
    if (message.interactive?.list_reply) {
      return message.interactive.list_reply.id;
    }

    if (message.button?.payload) {
      return message.button.payload;
    }

    // If it's an image message, return empty string so it's handled by image processing
    if (message.image) {
      return '';
    }

    return '';
  }

  private async getSession(phone: string) {
    const result = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.phone, phone))
      .limit(1);
    
    return result[0] || null;
  }

  private async createSession(phone: string) {
    const newSession = {
      phone,
      intent: null,
      step: null,
      data: {},
      updated_at: new Date(),
    };

    const result = await getDb()
      .insert(sessions)
      .values(newSession)
      .returning();

    return result[0];
  }

  async updateSession(phone: string, updates: Partial<typeof sessions.$inferInsert>) {
    await getDb()
      .update(sessions)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(sessions.phone, phone));
  }

  async clearSession(phone: string) {
    await getDb()
      .update(sessions)
      .set({ 
        intent: null, 
        step: null, 
        data: {}, 
        updated_at: new Date() 
      })
      .where(eq(sessions.phone, phone));
  }

  private async logMessage(
    phone: string, 
    direction: 'inbound' | 'outbound', 
    message: any
  ) {
    try {
      await getDb().insert(message_logs).values({
        phone,
        direction,
        message_type: message.type || 'unknown',
        content: JSON.stringify(message),
        metadata: { timestamp: message.timestamp },
      });
    } catch (error) {
      console.error('Error logging message:', error);
    }
  }
} 