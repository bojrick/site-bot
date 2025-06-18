import 'dotenv/config';
import { zohoEmailService } from '../src/services/zohoEmail';
import axios from 'axios';

async function setupZohoOAuth() {
  console.log('🔧 Zoho OAuth Setup Guide');
  console.log('========================\n');

  // Check if environment variables are set
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  console.log('Current Configuration:');
  console.log(`ZOHO_CLIENT_ID: ${clientId ? '✅ Set' : '❌ Missing'}`);
  console.log(`ZOHO_CLIENT_SECRET: ${clientSecret ? '✅ Set' : '❌ Missing'}`);
  console.log(`ZOHO_REFRESH_TOKEN: ${process.env.ZOHO_REFRESH_TOKEN ? '✅ Set' : '❌ Missing'}\n`);

  if (!clientId || !clientSecret) {
    console.log('⚠️  Please set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in your environment variables first.');
    console.log('Current values from your message:');
    console.log('ZOHO_CLIENT_ID=1000.6R5MW71WBIV5YQW19775D7R6789PYD');
    console.log('ZOHO_CLIENT_SECRET=1a1e87881e91ef5cb0ecb0590bca20b77d28b805cb');
    return;
  }

  if (!process.env.ZOHO_REFRESH_TOKEN) {
    console.log('📋 Step 1: Get Authorization Code');
    console.log('================================');
    console.log('You need to complete the OAuth flow to get a refresh token.');
    console.log('Follow these steps:\n');

    try {
      const authUrl = zohoEmailService.getAuthUrl();
      console.log('1. Open this URL in your browser:');
      console.log(`   ${authUrl}\n`);
      
      console.log('2. Log in to your Zoho account and authorize the application');
      console.log('3. You will be redirected to a page with an authorization code');
      console.log('4. Copy the authorization code from the URL');
      console.log('5. Run this command with the code:');
      console.log('   npm run setup-zoho -- --code=YOUR_AUTHORIZATION_CODE\n');
      
    } catch (error: any) {
      console.error('Error generating auth URL:', error);
    }
  } else {
    console.log('✅ Zoho OAuth is already configured!');
    console.log('\n🧪 Testing email service...');
    
    try {
      // Test the email service
      const testResult = await zohoEmailService.sendCustomerInquiryEmail({
        customerName: 'Test Customer',
        phone: '+91 9999999999',
        email: 'test@example.com',
        occupation: 'Software Developer',
        spaceRequirement: '1000 sq ft',
        spaceUse: 'Tech Startup Office',
        priceRange: '₹1-2 Crores'
      });

      if (testResult) {
        console.log('✅ Test email sent successfully!');
      } else {
        console.log('❌ Test email failed. Check the logs above.');
      }
    } catch (error: any) {
      console.error('❌ Error testing email service:', error);
    }
  }
}

async function exchangeCodeForTokens(authCode: string) {
  console.log('🔄 Exchanging authorization code for tokens...\n');

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = 'https://developer.zoho.com/oauth/redirect';

  try {
    const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        code: authCode,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        scope: 'ZohoMail.messages.CREATE,ZohoMail.accounts.READ'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    console.log('✅ Tokens received successfully!');
    console.log('\n📝 Add this to your environment variables:');
    console.log(`ZOHO_REFRESH_TOKEN=${refresh_token}`);
    console.log(`ZOHO_FROM_EMAIL=your-email@domain.com  # The email address you want to send from`);
    console.log('\n⚠️  Store the refresh token securely - it does not expire!');
    console.log(`Access token expires in: ${expires_in} seconds`);

  } catch (error: any) {
    console.error('❌ Error exchanging code for tokens:', error.response?.data || error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. The authorization code is correct and not expired');
    console.log('   2. Your client ID and secret are correct');
    console.log('   3. The redirect URI matches what you registered');
  }
}

// Main execution
const args = process.argv.slice(2);
const codeArg = args.find(arg => arg.startsWith('--code='));

if (codeArg) {
  const authCode = codeArg.split('=')[1];
  exchangeCodeForTokens(authCode);
} else {
  setupZohoOAuth();
} 