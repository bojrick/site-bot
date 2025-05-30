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

    console.log('🚀 [WEBHOOK] Starting webhook processing...');
    console.log('🔍 [WEBHOOK] Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      HAS_WHATSAPP_TOKEN: !!process.env.META_WHATSAPP_TOKEN,
      HAS_PHONE_ID: !!process.env.META_PHONE_NUMBER_ID,
      HAS_DB_URL: !!process.env.SUPABASE_DB_URL,
      DB_URL_LENGTH: process.env.SUPABASE_DB_URL?.length || 0,
    });

    // Extract message data
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages || value.messages.length === 0) {
      console.log('📭 [WEBHOOK] No messages in webhook payload');
      return;
    }

    const message = value.messages[0];
    const from = extractPhoneFromWebhook(body);

    if (!from) {
      console.log('❌ [WEBHOOK] Could not extract phone number from webhook');
      return;
    }

    console.log(`📨 [WEBHOOK] Received message from ${from}:`, {
      type: message.type,
      id: message.id,
      timestamp: message.timestamp
    });

    // Log the message for debugging
    console.log('[WEBHOOK] Message content:', JSON.stringify(message, null, 2));

    // Process the message with error tracking
    console.log('📤 [WEBHOOK] Calling messageHandler.handleMessage...');
    
    try {
      await messageHandler.handleMessage(from, message);
      console.log('✅ [WEBHOOK] Message handled successfully');
    } catch (handlerError) {
      console.error('❌ [WEBHOOK] Error in messageHandler:', handlerError);
      console.error('[WEBHOOK] Stack trace:', handlerError instanceof Error ? handlerError.stack : 'No stack');
    }

  } catch (error) {
    console.error('❌ [WEBHOOK] Top-level error processing webhook:', error);
    console.error('[WEBHOOK] Stack trace:', error instanceof Error ? error.stack : 'No stack');
    // Don't throw error - already sent 200 OK response
  }
});

export default router; 