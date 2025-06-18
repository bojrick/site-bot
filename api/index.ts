import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { testConnection } from '../src/db';
import webhookRoutes from '../src/routes/webhook';
import adminRoutes from '../src/routes/admin';
import zohoRoutes from '../src/routes/zoho';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add basic logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'WhatsApp Site Bot'
  });
});

// Root endpoint for Vercel
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'WhatsApp Site Bot API',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      webhook: '/webhook',
      admin: '/admin',
      zoho: '/zoho'
    }
  });
});

// WhatsApp webhook routes
app.use('/webhook', webhookRoutes);

// Admin routes for employee management
app.use('/admin', adminRoutes);

// Zoho email dashboard and OAuth routes
app.use('/zoho', zohoRoutes);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database connection on startup (for serverless)
let dbInitialized = false;

async function initializeApp() {
  if (!dbInitialized) {
    try {
      const dbConnected = await testConnection();
      if (!dbConnected) {
        console.log('⚠️  Database not connected - some features may not work');
      }
      dbInitialized = true;
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }
}

// Middleware to ensure database is initialized
app.use(async (req: Request, res: Response, next: NextFunction) => {
  await initializeApp();
  next();
});

// Export the Express app for Vercel
export default app; 