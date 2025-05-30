import axios from 'axios';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

export interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: string;
  text?: {
    body: string;
  };
  interactive?: {
    type: string;
    body?: { text: string };
    action: {
      buttons?: Array<{
        type: 'reply';
        reply: { id: string; title: string };
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
    language: { code: string };
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

export class WhatsAppService {
  private accessToken: string;
  private phoneNumberId: string;

  constructor() {
    this.accessToken = process.env.META_WHATSAPP_TOKEN!;
    this.phoneNumberId = process.env.META_PHONE_NUMBER_ID!;
    
    // Debug logging
    console.log('🔧 WhatsApp Service initialized:');
    console.log('📱 Phone Number ID:', this.phoneNumberId);
    console.log('🔐 Token exists:', !!this.accessToken);
    console.log('🔐 Token length:', this.accessToken?.length || 0);
    console.log('🔐 Token first 20 chars:', this.accessToken?.substring(0, 20) + '...');
  }

  // Send a simple text message
  async sendTextMessage(to: string, message: string): Promise<boolean> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      };

      await this.sendMessage(payload);
      return true;
    } catch (error) {
      console.error('Error sending text message:', error);
      return false;
    }
  }

  // Send interactive button message
  async sendButtonMessage(
    to: string, 
    bodyText: string, 
    buttons: Array<{ id: string; title: string }>
  ): Promise<boolean> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: buttons.map(btn => ({
              type: 'reply' as const,
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      };

      await this.sendMessage(payload);
      return true;
    } catch (error) {
      console.error('Error sending button message:', error);
      return false;
    }
  }

  // Send interactive list message
  async sendListMessage(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>
  ): Promise<boolean> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: buttonText,
            sections,
          },
        },
      };

      await this.sendMessage(payload);
      return true;
    } catch (error) {
      console.error('Error sending list message:', error);
      return false;
    }
  }

  // Send template message (for OTP, confirmations, etc.)
  async sendTemplateMessage(
    to: string,
    templateName: string,
    parameters: string[]
  ): Promise<boolean> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: parameters.map(param => ({
                type: 'text',
                text: param,
              })),
            },
          ],
        },
      };

      await this.sendMessage(payload);
      return true;
    } catch (error) {
      console.error('Error sending template message:', error);
      return false;
    }
  }

  // Get media URL from media ID
  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const url = `${WHATSAPP_API_URL}/${mediaId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return response.data.url || null;
    } catch (error) {
      console.error('Error getting media URL:', error);
      return null;
    }
  }

  // Download media from WhatsApp
  async downloadMedia(mediaUrl: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error downloading media:', error);
      return null;
    }
  }

  // Process image message and return image data
  async processImageMessage(imageMessage: ImageMessage): Promise<{
    success: boolean;
    mediaUrl?: string;
    caption?: string;
    mediaId: string;
  }> {
    try {
      const mediaUrl = await this.getMediaUrl(imageMessage.id);
      
      return {
        success: !!mediaUrl,
        mediaUrl: mediaUrl || undefined,
        caption: imageMessage.caption,
        mediaId: imageMessage.id
      };
    } catch (error) {
      console.error('Error processing image message:', error);
      return {
        success: false,
        mediaId: imageMessage.id
      };
    }
  }

  // Core method to send message to WhatsApp API
  private async sendMessage(payload: WhatsAppMessage): Promise<void> {
    const url = `${WHATSAPP_API_URL}/${this.phoneNumberId}/messages`;
    
    console.log('📤 Sending message to WhatsApp API...');
    console.log('🔗 URL:', url);
    console.log('📱 Phone Number ID:', this.phoneNumberId);
    console.log('🔐 Token (first 20):', this.accessToken?.substring(0, 20) + '...');
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`WhatsApp API error: ${response.status}`);
      }

      console.log('✅ Message sent successfully:', response.data);
    } catch (error: any) {
      console.error('❌ Failed to send message:');
      console.error('Status:', error.response?.status);
      console.error('Error data:', error.response?.data);
      console.error('Error message:', error.message);
      throw error;
    }
  }

  // Mark message as read
  async markAsRead(messageId: string): Promise<void> {
    try {
      const url = `${WHATSAPP_API_URL}/${this.phoneNumberId}/messages`;
      
      await axios.post(url, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }
}

export const whatsappService = new WhatsAppService(); 