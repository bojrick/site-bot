import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { testConnection } from './db';
import webhookRoutes from './routes/webhook';
import adminRoutes from './routes/admin';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// WhatsApp webhook routes
app.use('/webhook', webhookRoutes);

// Admin routes for employee management
app.use('/admin', adminRoutes);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Test database connection (don't fail if it's not available)
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.log('⚠️  Database not connected - some features may not work');
      console.log('🔗 Configure SUPABASE_DB_URL in .env to enable database features');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 WhatsApp webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
      
      if (!dbConnected) {
        console.log('\n💡 To set up database:');
        console.log('   1. Create a Supabase project at https://supabase.com');
        console.log('   2. Add your database URL to .env file');
        console.log('   3. Run: npm run drizzle:push');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 