import { Router, Request, Response } from 'express';
import { MessageHandler } from '../services/messageHandler';
import { extractPhoneFromWebhook } from '../utils/phone';

const router = Router();
const messageHandler = new MessageHandler();

// Webhook verification (GET)
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔐 Webhook verification request:', { mode, token });

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_SECRET) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

// Webhook message handler (POST)
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    
    // Always respond with 200 OK immediately
    res.status(200).send('OK');

    // Extract message data
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages || value.messages.length === 0) {
      console.log('📭 No messages in webhook payload');
      return;
    }

    const message = value.messages[0];
    const from = extractPhoneFromWebhook(body);

    if (!from) {
      console.log('❌ Could not extract phone number from webhook');
      return;
    }

    console.log(`📨 Received message from ${from}:`, {
      type: message.type,
      id: message.id,
      timestamp: message.timestamp
    });

    // Log the message for debugging
    console.log('Message content:', JSON.stringify(message, null, 2));

    // Process the message
    await messageHandler.handleMessage(from, message);

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    // Don't throw error - already sent 200 OK response
  }
});

export default router; 