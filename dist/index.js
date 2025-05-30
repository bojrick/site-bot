"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
const webhook_1 = __importDefault(require("./routes/webhook"));
const admin_1 = __importDefault(require("./routes/admin"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Add basic logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'WhatsApp Site Bot'
    });
});
// WhatsApp webhook routes
app.use('/webhook', webhook_1.default);
// Admin routes for employee management
app.use('/admin', admin_1.default);
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
// Start server
async function startServer() {
    try {
        // Test database connection (don't fail if it's not available)
        const dbConnected = await (0, db_1.testConnection)();
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
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index.js.map