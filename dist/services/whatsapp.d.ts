export interface WhatsAppMessage {
    messaging_product: 'whatsapp';
    to: string;
    type: string;
    text?: {
        body: string;
    };
    interactive?: {
        type: string;
        body?: {
            text: string;
        };
        action: {
            buttons?: Array<{
                type: 'reply';
                reply: {
                    id: string;
                    title: string;
                };
            }>;
            button?: string;
            sections?: Array<{
                title: string;
                rows: Array<{
                    id: string;
                    title: string;
                    description?: string;
                }>;
            }>;
        };
    };
    template?: {
        name: string;
        language: {
            code: string;
        };
        components: Array<{
            type: string;
            parameters: Array<{
                type: string;
                text: string;
            }>;
        }>;
    };
}
export interface ImageMessage {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
}
export declare class WhatsAppService {
    private accessToken;
    private phoneNumberId;
    constructor();
    sendTextMessage(to: string, message: string): Promise<boolean>;
    sendButtonMessage(to: string, bodyText: string, buttons: Array<{
        id: string;
        title: string;
    }>): Promise<boolean>;
    sendListMessage(to: string, bodyText: string, buttonText: string, sections: Array<{
        title: string;
        rows: Array<{
            id: string;
            title: string;
            description?: string;
        }>;
    }>): Promise<boolean>;
    sendTemplateMessage(to: string, templateName: string, parameters: string[]): Promise<boolean>;
    getMediaUrl(mediaId: string): Promise<string | null>;
    downloadMedia(mediaUrl: string): Promise<Buffer | null>;
    processImageMessage(imageMessage: ImageMessage): Promise<{
        success: boolean;
        mediaUrl?: string;
        caption?: string;
        mediaId: string;
    }>;
    private sendMessage;
    markAsRead(messageId: string): Promise<void>;
}
export declare const whatsappService: WhatsAppService;
//# sourceMappingURL=whatsapp.d.ts.map