const axios = require('axios');
require('dotenv').config();

async function testWhatsAppToken() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  
  console.log('🔑 Testing WhatsApp access token...');
  console.log('📱 Phone Number ID:', phoneNumberId);
  console.log('🔐 Token (first 20 chars):', token?.substring(0, 20) + '...');
  
  try {
    // Test by getting phone number info
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${phoneNumberId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('✅ Token is valid!');
    console.log('📞 Phone Number Info:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Token is invalid or expired!');
    console.log('Error:', error.response?.data || error.message);
    return false;
  }
}

testWhatsAppToken(); 