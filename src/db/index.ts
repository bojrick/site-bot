import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy initialization of the pool
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Function to get or create the database connection
function getDatabase() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    
    if (!connectionString) {
      console.error('❌ [DB] SUPABASE_DB_URL not set!');
      throw new Error('Database connection string not configured');
    }
    
    console.log('🔄 [DB] Creating new database pool...');
    pool = new Pool({
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
    
    db = drizzle(pool, { schema });
    console.log('✅ [DB] Database pool created');
  }
  return { pool, db };
}

// Export the database instance with lazy loading
export const getDb = (): ReturnType<typeof drizzle> => {
  try {
    const { db } = getDatabase();
    if (!db) {
      throw new Error('Database not initialized');
    }
    return db;
  } catch (error) {
    console.error('❌ [DB] Failed to get database:', error);
    throw error;
  }
};

// Helper function to test database connection
export async function testConnection() {
  try {
    const { pool } = getDatabase();
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
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

export { schema }; 