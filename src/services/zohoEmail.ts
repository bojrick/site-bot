import axios from 'axios';

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface EmailData {
  customerName: string;
  phone: string;
  email: string;
  occupation: string;
  spaceRequirement: string;
  spaceUse: string;
  priceRange: string;
}

export class ZohoEmailService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  
  private readonly clientId = process.env.ZOHO_CLIENT_ID;
  private readonly clientSecret = process.env.ZOHO_CLIENT_SECRET;
  private readonly refreshToken = process.env.ZOHO_REFRESH_TOKEN; // This will need to be set after initial OAuth
  
  constructor() {
    if (!this.clientId || !this.clientSecret) {
      console.warn('Zoho credentials not configured. Email notifications will be disabled.');
    }
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      // If we have a valid token, return it
      if (this.accessToken && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      // If we don't have a refresh token, we can't get access token automatically
      if (!this.refreshToken) {
        console.warn('No Zoho refresh token available. Please complete OAuth setup.');
        return null;
      }

      // Refresh the access token
      const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
        params: {
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret
        }
      });

      const tokenData: ZohoTokenResponse = response.data;
      this.accessToken = tokenData.access_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000; // 1 minute buffer

      return this.accessToken;
    } catch (error) {
      console.error('Error getting Zoho access token:', error);
      return null;
    }
  }

  async sendCustomerInquiryEmail(emailData: EmailData): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        console.log('Cannot send email - no valid access token');
        return false;
      }

      const emailBody = this.createEmailBody(emailData);
      
      const emailPayload = {
        fromAddress: process.env.ZOHO_FROM_EMAIL || 'noreply@reevaempire.com',
        toAddress: 'info@reevaempire.com',
        subject: `New Customer Inquiry - ${emailData.customerName}`,
        content: emailBody,
        contentType: 'html'
      };

      const response = await axios.post(
        'https://www.zohoapis.com/mail/v1/accounts/info@reevaempire.com/messages',
        emailPayload,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Email sent successfully:', response.status);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      
      // Fallback: log the email content for manual processing
      console.log('EMAIL CONTENT FOR MANUAL PROCESSING:');
      console.log('To: info@reevaempire.com');
      console.log('Subject: New Customer Inquiry -', emailData.customerName);
      console.log('Body:', this.createEmailBody(emailData));
      
      return false;
    }
  }

  private createEmailBody(emailData: EmailData): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2c5aa0;">New Customer Inquiry - Suvasam Gota Commercial Hub</h2>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #2c5aa0; margin-top: 0;">Customer Details:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 200px;">Name:</td>
                <td style="padding: 8px;">${emailData.customerName}</td>
              </tr>
              <tr style="background-color: #fff;">
                <td style="padding: 8px; font-weight: bold;">Phone:</td>
                <td style="padding: 8px;">${emailData.phone}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Email:</td>
                <td style="padding: 8px;">${emailData.email}</td>
              </tr>
              <tr style="background-color: #fff;">
                <td style="padding: 8px; font-weight: bold;">Occupation:</td>
                <td style="padding: 8px;">${emailData.occupation}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Space Requirement:</td>
                <td style="padding: 8px;">${emailData.spaceRequirement}</td>
              </tr>
              <tr style="background-color: #fff;">
                <td style="padding: 8px; font-weight: bold;">Intended Use:</td>
                <td style="padding: 8px;">${emailData.spaceUse}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Budget Range:</td>
                <td style="padding: 8px;">${emailData.priceRange}</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #2c5aa0;">This inquiry was received through the WhatsApp bot.</p>
            <p style="margin: 5px 0 0 0; font-size: 14px;">Please follow up with the customer within 24 hours.</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p>Source: WhatsApp Customer Bot</p>
          </div>
        </body>
      </html>
    `;
  }

  // Method to help with initial OAuth setup (for development/setup)
  getAuthUrl(): string {
    if (!this.clientId) {
      throw new Error('ZOHO_CLIENT_ID not configured');
    }
    
    const redirectUri = 'https://developer.zoho.com/oauth/redirect'; // Use Zoho's default for initial setup
    const scope = 'ZohoMail.messages.CREATE,ZohoMail.accounts.READ';
    
    return `https://accounts.zoho.com/oauth/v2/auth?client_id=${this.clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&access_type=offline`;
  }
}

export const zohoEmailService = new ZohoEmailService(); 