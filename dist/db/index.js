"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.schema = exports.getDb = void 0;
exports.testConnection = testConnection;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const schema = __importStar(require("./schema"));
exports.schema = schema;
// Lazy initialization of the pool
let pool = null;
let db = null;
// Function to get or create the database connection
function getDatabase() {
    if (!pool) {
        const connectionString = process.env.SUPABASE_DB_URL;
        if (!connectionString) {
            console.error('❌ [DB] SUPABASE_DB_URL not set!');
            throw new Error('Database connection string not configured');
        }
        console.log('🔄 [DB] Creating new database pool...');
        pool = new pg_1.Pool({
            connectionString,
            ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
            // Serverless-optimized settings
            max: 1, // Minimize connections for serverless
            idleTimeoutMillis: 0, // Disable idle timeout
            connectionTimeoutMillis: 5000, // 5 second connection timeout
        });
        // Add error handling
        pool.on('error', (err) => {
            console.error('❌ [DB] Unexpected pool error:', err);
        });
        db = (0, node_postgres_1.drizzle)(pool, { schema });
        console.log('✅ [DB] Database pool created');
    }
    return { pool, db };
}
// Export the database instance with lazy loading
const getDb = () => {
    try {
        const { db } = getDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }
        return db;
    }
    catch (error) {
        console.error('❌ [DB] Failed to get database:', error);
        throw error;
    }
};
exports.getDb = getDb;
// Helper function to test database connection
async function testConnection() {
    try {
        const { pool } = getDatabase();
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Database connection successful');
        return true;
    }
    catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Closing database connections...');
    if (pool) {
        await pool.end();
    }
    process.exit(0);
});
//# sourceMappingURL=index.js.map