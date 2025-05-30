const axios = require('axios');
require('dotenv').config();

async function testSendMessage() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const testPhoneNumber = '+19088483575'; // The number that's been messaging
  
  console.log('📤 Testing message sending...');
  
  const payload = {
    messaging_product: 'whatsapp',
    to: testPhoneNumber,
    type: 'text',
    text: { body: 'Test message from bot!' }
  };
  
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Message sent successfully!');
    console.log('📱 Response:', response.data);
  } catch (error) {
    console.log('❌ Message sending failed!');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data);
    console.log('Full error:', error.message);
  }
}

testSendMessage(); 