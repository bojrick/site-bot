import { getDb } from '../db';
import { users, sessions, employee_otps, message_logs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { whatsappService, ImageMessage } from './whatsapp';
import { UserService } from './userService';
import { EmployeeFlowOrchestrator } from './flows/employee/EmployeeFlowOrchestrator';
import { CustomerFlow } from './flows/customerFlow';
import { AdminFlow } from './flows/adminFlow';
import { normalizePhoneNumber } from '../utils/phone';
import { InventoryFlow } from './flows/inventoryFlow';

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
    // Only log timeout errors as warnings, not errors, since we have fallbacks
    if (error instanceof Error && error.message.includes('timed out')) {
      console.warn(`⏰ [TIMEOUT] ${operation} timed out, using fallback`);
    } else {
      console.error(`❌ [ERROR] ${operation} failed:`, error);
    }
    return null;
  }
}

// Retry wrapper for critical operations
async function withRetry<T>(
  promiseFactory: () => Promise<T>, 
  maxRetries: number, 
  operation: string,
  timeoutMs: number = 10000
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(promiseFactory(), timeoutMs, `${operation} (attempt ${attempt})`);
      if (result !== null) {
        return result;
      }
    } catch (error) {
      console.warn(`⏰ [RETRY] ${operation} attempt ${attempt}/${maxRetries} failed`);
    }
    
    if (attempt < maxRetries) {
      // Exponential backoff: wait 1s, 2s, 4s...
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error(`❌ [RETRY] ${operation} failed after ${maxRetries} attempts`);
  return null;
}

export class MessageHandler {
  private userService: UserService;
  private employeeOrchestrator: EmployeeFlowOrchestrator;
  private customerFlow: CustomerFlow;
  private adminFlow: AdminFlow;
  private inventoryFlow: InventoryFlow;

  constructor() {
    console.log('🏗️ [HANDLER] Initializing MessageHandler...');
    this.userService = new UserService();
    this.employeeOrchestrator = new EmployeeFlowOrchestrator();
    this.customerFlow = new CustomerFlow();
    this.adminFlow = new AdminFlow();
    this.inventoryFlow = new InventoryFlow();
  }

  async handleMessage(phone: string, message: WhatsAppMessage): Promise<void> {
    console.log('🎯 [HANDLER] Starting handleMessage...');
    
    try {
      const normalizedPhone = normalizePhoneNumber(phone);
      console.log(`📱 [HANDLER] Normalized phone: ${normalizedPhone}`);
      
      // Test database connection with longer timeout
      console.log('🗄️ [HANDLER] Testing database connection...');
      const dbConnected = await withTimeout(
        this.testDbConnection(),
        8000, // Increased from 3000ms to 8000ms
        'Database connection test'
      );
      
      if (!dbConnected) {
        console.warn('⚠️ [HANDLER] Database not available, continuing without DB features');
      }
      
      // Log the message (with timeout, non-blocking) - not critical so keep shorter timeout
      if (dbConnected) {
        console.log('📝 [HANDLER] Logging message...');
        await withTimeout(
          this.logMessage(normalizedPhone, 'inbound', message),
          5000, // Increased from 2000ms to 5000ms
          'Message logging'
        );
      }

      // Mark message as read with longer timeout for WhatsApp API (continue even if it fails)
      console.log('👁️ [HANDLER] Marking message as read...');
      await withTimeout(
        whatsappService.markAsRead(message.id),
        10000, // Increased from 2000ms to 10000ms for external API
        'Mark as read'
      );

      // Get or create user with retry for critical operation
      console.log('👤 [HANDLER] Getting/creating user...');
      let user = await withRetry(
        () => this.userService.getOrCreateUser(normalizedPhone),
        2, // 2 retries
        'Get/create user',
        10000 // 10 second timeout per attempt
      );
      
      // If database failed, create a temporary user object
      if (!user) {
        console.log('⚠️ [HANDLER] Using temporary user (DB unavailable)');
        user = {
          id: null,
          phone: normalizedPhone,
          role: 'customer' as const,
          name: null,
          email: null,
          is_verified: false,
          verified_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          introduction_sent: false,
          introduction_sent_at: null
        };
      }
      // Null check before using user.role
      if (!user) {
        console.error('❌ [HANDLER] No user available, aborting message handling.');
        return;
      }
      console.log(`✅ [HANDLER] User obtained: ${user!.role}`);
      
      // Get or create session with retry for critical operation
      console.log('🔄 [HANDLER] Getting/creating session...');
      let session = null;
      if (dbConnected) {
        session = await withRetry(
          () => this.getSession(normalizedPhone),
          2, // 2 retries
          'Get session',
          8000 // 8 second timeout per attempt
        );
        if (!session) {
          console.log('🆕 [HANDLER] Creating new session...');
          session = await withRetry(
            () => this.createSession(normalizedPhone),
            2, // 2 retries
            'Create session',
            8000 // 8 second timeout per attempt
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

      console.log(`👤 [HANDLER] User: ${user!.role}, Phone: ${normalizedPhone}`);
      console.log(`💬 [HANDLER] Message: "${messageText}"`);
      console.log(`📸 [HANDLER] Has Image: ${!!imageData}`);
      console.log(`🎯 [HANDLER] Session: ${session.intent || 'none'}, Step: ${session.step || 'none'}`);

      // Route to appropriate flow based on user role
      console.log(`🚦 [HANDLER] Routing to ${user!.role} flow...`);
      if (user!.role === 'employee') {
        await this.employeeOrchestrator.handleMessage(
          user!, 
          session, 
          messageText, 
          interactiveData,
          imageData
        );
      } else if (user!.role === 'customer') {
        await this.customerFlow.handleMessage(
          user!, 
          session, 
          messageText, 
          interactiveData
        );
      } else if (user!.role === 'admin') {
        await this.adminFlow.handleMessage(
          user!, 
          session, 
          messageText, 
          interactiveData,
          imageData
        );
      } else {
        // Unknown role fallback
        console.error(`❌ [HANDLER] Unknown user role: ${user!.role}`);
        return;
      }
      console.log('✅ [HANDLER] Flow handling completed');

    } catch (error) {
      console.error('❌ [HANDLER] Error in message handler:', error);
      console.error('[HANDLER] Error type:', error?.constructor?.name);
      console.error('[HANDLER] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[HANDLER] Stack trace:', error instanceof Error ? error.stack : 'No stack');
      
      // Send error message to user
      try {
        // If we have a user object from the main flow, use it; otherwise try to get user with timeout
        let user = null;
        if (arguments[1] && typeof arguments[1] === 'object') {
          // Try to extract user from the current context if available
          user = arguments[1];
        } else {
          // Only try to get user if database seems available, with a short timeout
          user = await withTimeout(
            this.userService.getUserByPhone(normalizePhoneNumber(phone)),
            3000,
            'Get user for error message'
          );
        }
        
        let errorMessage = "Sorry, I encountered an error processing your message. Please try again or type 'help' for assistance.";
        
        if (user?.role === 'employee') {
          errorMessage = "માફ કરશો, તમારા મેસેજને પ્રોસેસ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા મદદ માટે 'મદદ' ટાઈપ કરો.";
        } else if (user?.role === 'admin') {
          errorMessage = "🔧 Admin: System error occurred. Check logs or type 'help' for admin commands.";
        }
        
        // Use a longer timeout for WhatsApp API call
        await withTimeout(
          whatsappService.sendTextMessage(normalizePhoneNumber(phone), errorMessage),
          10000,
          'Send error message'
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
      // Don't throw errors for logging failures - it's not critical
      console.warn('📝 [LOG] Message logging failed (non-critical):', error instanceof Error ? error.message : String(error));
    }
  }

  private async testDbConnection(): Promise<boolean> {
    try {
      const db = getDb();
      // Simple and fast query to test connection - just get count
      const result = await db.select().from(sessions).limit(1);
      return true;
    } catch (error) {
      console.warn('🗄️ [DB] Database connection test failed:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
} 