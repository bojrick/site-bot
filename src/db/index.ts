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
      ssl: true, // Always use SSL for Supabase pooler
      max: 1, // Keep one connection for serverless
      idleTimeoutMillis: 120000, // 2 minute idle timeout
      connectionTimeoutMillis: 3000, // Match the handler timeout
      keepAlive: true, // Enable TCP keepalive
      statement_timeout: 10000, // 10 second query timeout
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
    try {
      await client.query('SELECT 1'); // Lighter query than NOW()
      console.log('✅ Database connection successful');
      return true;
    } finally {
      client.release(true); // Force release the client
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    if (pool) {
      try {
        await pool.end(); // Clean up the pool on error
      } catch (endError) {
        console.error('Failed to end pool:', endError);
      }
    }
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