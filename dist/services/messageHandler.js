"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const whatsapp_1 = require("./whatsapp");
const userService_1 = require("./userService");
const employeeFlow_1 = require("./flows/employeeFlow");
const customerFlow_1 = require("./flows/customerFlow");
const phone_1 = require("../utils/phone");
// Timeout wrapper for database operations
async function withTimeout(promise, timeoutMs, operation) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    }
    catch (error) {
        clearTimeout(timeoutId);
        console.error(`❌ [TIMEOUT] ${operation} failed:`, error);
        return null;
    }
}
class MessageHandler {
    constructor() {
        console.log('🏗️ [HANDLER] Initializing MessageHandler...');
        this.userService = new userService_1.UserService();
        this.employeeFlow = new employeeFlow_1.EmployeeFlow();
        this.customerFlow = new customerFlow_1.CustomerFlow();
    }
    async handleMessage(phone, message) {
        console.log('🎯 [HANDLER] Starting handleMessage...');
        try {
            const normalizedPhone = (0, phone_1.normalizePhoneNumber)(phone);
            console.log(`📱 [HANDLER] Normalized phone: ${normalizedPhone}`);
            // Test database connection with timeout
            console.log('🗄️ [HANDLER] Testing database connection...');
            const dbConnected = await withTimeout(this.testDbConnection(), 3000, 'Database connection test');
            if (!dbConnected) {
                console.warn('⚠️ [HANDLER] Database not available, continuing without DB features');
            }
            // Log the message (with timeout, non-blocking)
            if (dbConnected) {
                console.log('📝 [HANDLER] Logging message...');
                await withTimeout(this.logMessage(normalizedPhone, 'inbound', message), 2000, 'Message logging');
            }
            // Mark message as read (continue even if it fails)
            console.log('👁️ [HANDLER] Marking message as read...');
            await withTimeout(whatsapp_1.whatsappService.markAsRead(message.id), 2000, 'Mark as read');
            // Get or create user with fallback
            console.log('👤 [HANDLER] Getting/creating user...');
            let user = await withTimeout(this.userService.getOrCreateUser(normalizedPhone), 3000, 'Get/create user');
            // If database failed, create a temporary user object
            if (!user) {
                console.log('⚠️ [HANDLER] Using temporary user (DB unavailable)');
                user = {
                    id: 'temp-' + normalizedPhone,
                    phone: normalizedPhone,
                    role: 'customer',
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
                session = await withTimeout(this.getSession(normalizedPhone), 2000, 'Get session');
                if (!session) {
                    console.log('🆕 [HANDLER] Creating new session...');
                    session = await withTimeout(this.createSession(normalizedPhone), 2000, 'Create session');
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
                await this.employeeFlow.handleMessage(user, session, messageText, interactiveData, imageData);
            }
            else {
                await this.customerFlow.handleMessage(user, session, messageText, interactiveData);
            }
            console.log('✅ [HANDLER] Flow handling completed');
        }
        catch (error) {
            console.error('❌ [HANDLER] Error in message handler:', error);
            console.error('[HANDLER] Error type:', error?.constructor?.name);
            console.error('[HANDLER] Error message:', error instanceof Error ? error.message : String(error));
            console.error('[HANDLER] Stack trace:', error instanceof Error ? error.stack : 'No stack');
            // Send error message to user
            try {
                const user = await this.userService.getUserByPhone((0, phone_1.normalizePhoneNumber)(phone));
                const errorMessage = user?.role === 'employee'
                    ? "માફ કરશો, તમારા મેસેજને પ્રોસેસ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા મદદ માટે 'મદદ' ટાઈપ કરો."
                    : "Sorry, I encountered an error processing your message. Please try again or type 'help' for assistance.";
                await whatsapp_1.whatsappService.sendTextMessage((0, phone_1.normalizePhoneNumber)(phone), errorMessage);
            }
            catch (sendError) {
                console.error('❌ [HANDLER] Error sending error message:', sendError);
            }
        }
    }
    extractMessageText(message) {
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
    async getSession(phone) {
        const result = await (0, db_1.getDb)()
            .select()
            .from(schema_1.sessions)
            .where((0, drizzle_orm_1.eq)(schema_1.sessions.phone, phone))
            .limit(1);
        return result[0] || null;
    }
    async createSession(phone) {
        const newSession = {
            phone,
            intent: null,
            step: null,
            data: {},
            updated_at: new Date(),
        };
        const result = await (0, db_1.getDb)()
            .insert(schema_1.sessions)
            .values(newSession)
            .returning();
        return result[0];
    }
    async updateSession(phone, updates) {
        await (0, db_1.getDb)()
            .update(schema_1.sessions)
            .set({ ...updates, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.sessions.phone, phone));
    }
    async clearSession(phone) {
        await (0, db_1.getDb)()
            .update(schema_1.sessions)
            .set({
            intent: null,
            step: null,
            data: {},
            updated_at: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.sessions.phone, phone));
    }
    async logMessage(phone, direction, message) {
        try {
            await (0, db_1.getDb)().insert(schema_1.message_logs).values({
                phone,
                direction,
                message_type: message.type || 'unknown',
                content: JSON.stringify(message),
                metadata: { timestamp: message.timestamp },
            });
        }
        catch (error) {
            console.error('Error logging message:', error);
        }
    }
    async testDbConnection() {
        try {
            const db = (0, db_1.getDb)();
            // Simple query to test connection
            await db.select().from(schema_1.sessions).limit(1);
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
exports.MessageHandler = MessageHandler;
//# sourceMappingURL=messageHandler.js.map