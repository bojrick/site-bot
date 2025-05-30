import { sessions } from '../db/schema';
import { ImageMessage } from './whatsapp';
export interface WhatsAppMessage {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: {
        body: string;
    };
    interactive?: {
        type: string;
        button_reply?: {
            id: string;
            title: string;
        };
        list_reply?: {
            id: string;
            title: string;
            description?: string;
        };
    };
    button?: {
        text: string;
        payload: string;
    };
    image?: ImageMessage;
}
export declare class MessageHandler {
    private userService;
    private employeeFlow;
    private customerFlow;
    constructor();
    handleMessage(phone: string, message: WhatsAppMessage): Promise<void>;
    private extractMessageText;
    private getSession;
    private createSession;
    updateSession(phone: string, updates: Partial<typeof sessions.$inferInsert>): Promise<void>;
    clearSession(phone: string): Promise<void>;
    private logMessage;
    private testDbConnection;
}
//# sourceMappingURL=messageHandler.d.ts.map