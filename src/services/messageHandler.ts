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

// Timeout wrapper for database operations
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T | null> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    console.error(`❌ [TIMEOUT] ${operation} failed:`, error);
    return null;
  }
}

export class MessageHandler {
  private userService: UserService;
  private employeeFlow: EmployeeFlow;
  private customerFlow: CustomerFlow;

  constructor() {
    console.log('🏗️ [HANDLER] Initializing MessageHandler...');
    this.userService = new UserService();
    this.employeeFlow = new EmployeeFlow();
    this.customerFlow = new CustomerFlow();
  }

  async handleMessage(phone: string, message: WhatsAppMessage): Promise<void> {
    console.log('🎯 [HANDLER] Starting handleMessage...');
    
    try {
      const normalizedPhone = normalizePhoneNumber(phone);
      console.log(`📱 [HANDLER] Normalized phone: ${normalizedPhone}`);
      
      // Test database connection with timeout
      console.log('🗄️ [HANDLER] Testing database connection...');
      const dbConnected = await withTimeout(
        this.testDbConnection(),
        3000,
        'Database connection test'
      );
      
      if (!dbConnected) {
        console.warn('⚠️ [HANDLER] Database not available, continuing without DB features');
      }
      
      // Log the message (with timeout, non-blocking)
      if (dbConnected) {
        console.log('📝 [HANDLER] Logging message...');
        await withTimeout(
          this.logMessage(normalizedPhone, 'inbound', message),
          2000,
          'Message logging'
        );
      }

      // Mark message as read (continue even if it fails)
      console.log('👁️ [HANDLER] Marking message as read...');
      await withTimeout(
        whatsappService.markAsRead(message.id),
        2000,
        'Mark as read'
      );

      // Get or create user with fallback
      console.log('👤 [HANDLER] Getting/creating user...');
      let user = await withTimeout(
        this.userService.getOrCreateUser(normalizedPhone),
        3000,
        'Get/create user'
      );
      
      // If database failed, create a temporary user object
      if (!user) {
        console.log('⚠️ [HANDLER] Using temporary user (DB unavailable)');
        user = {
          id: 'temp-' + normalizedPhone,
          phone: normalizedPhone,
          role: 'customer' as const,
          name: 'Guest',
          email: null,
          is_verified: false,
          verified_at: null,
          created_at: new Date(),
          updated_at: new Date()
        };
      }
      console.log(`✅ [HANDLER] User obtained: ${user.role}`);
      
      // Get or create session with fallback
      console.log('🔄 [HANDLER] Getting/creating session...');
      let session = null;
      if (dbConnected) {
        session = await withTimeout(
          this.getSession(normalizedPhone),
          2000,
          'Get session'
        );
        if (!session) {
          console.log('🆕 [HANDLER] Creating new session...');
          session = await withTimeout(
            this.createSession(normalizedPhone),
            2000,
            'Create session'
          );
        }
      }
      
      // If no session from DB, create temporary one
      if (!session) {
        console.log('⚠️ [HANDLER] Using temporary session (DB unavailable)');
        session = {
          phone: normalizedPhone,
          intent: null,
          step: null,
          data: {},
          updated_at: new Date()
        };
      }
      console.log('✅ [HANDLER] Session obtained');

      // Extract message content
      const messageText = this.extractMessageText(message);
      const interactiveData = message.interactive;
      const imageData = message.image;

      console.log(`👤 [HANDLER] User: ${user.role}, Phone: ${normalizedPhone}`);
      console.log(`💬 [HANDLER] Message: "${messageText}"`);
      console.log(`📸 [HANDLER] Has Image: ${!!imageData}`);
      console.log(`🎯 [HANDLER] Session: ${session.intent || 'none'}, Step: ${session.step || 'none'}`);

      // Route to appropriate flow based on user role
      console.log(`🚦 [HANDLER] Routing to ${user.role} flow...`);
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
      console.log('✅ [HANDLER] Flow handling completed');

    } catch (error) {
      console.error('❌ [HANDLER] Error in message handler:', error);
      console.error('[HANDLER] Error type:', error?.constructor?.name);
      console.error('[HANDLER] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[HANDLER] Stack trace:', error instanceof Error ? error.stack : 'No stack');
      
      // Send error message to user
      try {
        const user = await this.userService.getUserByPhone(normalizePhoneNumber(phone));
        const errorMessage = user?.role === 'employee' 
          ? "માફ કરશો, તમારા મેસેજને પ્રોસેસ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા મદદ માટે 'મદદ' ટાઈપ કરો."
          : "Sorry, I encountered an error processing your message. Please try again or type 'help' for assistance.";
        
        await whatsappService.sendTextMessage(
          normalizePhoneNumber(phone),
          errorMessage
        );
      } catch (sendError) {
        console.error('❌ [HANDLER] Error sending error message:', sendError);
      }
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

  private async testDbConnection(): Promise<boolean> {
    try {
      const db = getDb();
      // Simple query to test connection
      await db.select().from(sessions).limit(1);
      return true;
    } catch (error) {
      return false;
    }
  }
} 