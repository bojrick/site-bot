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

    // Add connection parameters if not already present
    const connStringWithParams = connectionString.includes('?') 
      ? connectionString + '&pgbouncer=true&connect_timeout=15&pool_timeout=15&connection_limit=5'
      : connectionString + '?pgbouncer=true&connect_timeout=15&pool_timeout=15&connection_limit=5';
    
    console.log('🔄 [DB] Creating new database pool...');
    pool = new Pool({
      connectionString: connStringWithParams,
      ssl: {
        rejectUnauthorized: false,
        requestCert: true
      },
      max: 5, // Increase from 1 to 5 for better connection handling
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 1000,
      statement_timeout: 15000,
    });
    
    // Add error handling
    pool.on('error', (err) => {
      console.error('❌ [DB] Unexpected pool error:', err);
      // Reset pool on error
      pool = null;
      db = null;
    });
    
    // Add connect handling
    pool.on('connect', (client) => {
      console.log('✅ [DB] New client connected');
      client.on('error', (err) => {
        console.error('❌ [DB] Client error:', err);
      });
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
    console.log('🔄 [DB] Testing connection...');
    const { pool } = getDatabase();
    
    // Try to get a client with a longer timeout
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 15000)
      )
    ]) as any;

    try {
      console.log('✅ [DB] Client acquired, testing query...');
      // Use a query with timeout
      await client.query('SELECT 1 /* connection test */ ');
      console.log('✅ [DB] Database connection and query successful');
      return true;
    } catch (queryError) {
      console.error('❌ [DB] Query failed:', queryError);
      return false;
    } finally {
      console.log('🔄 [DB] Releasing client...');
      if (client?.release) {
        await client.release(true);
      }
    }
  } catch (error) {
    console.error('❌ [DB] Connection test failed:', error);
    // Log connection details (without sensitive info)
    const connStr = process.env.SUPABASE_DB_URL || '';
    console.log('🔍 [DB] Connection details:');
    console.log('- Host:', connStr.split('@')[1]?.split('/')[0] || 'unknown');
    console.log('- Database:', connStr.split('/').pop()?.split('?')[0] || 'unknown');
    console.log('- Using pgbouncer:', connStr.includes('pgbouncer=true'));
    console.log('- Region:', process.env.VERCEL_REGION || 'unknown');
    
    if (pool) {
      try {
        await pool.end();
      } catch (endError) {
        console.error('Failed to end pool:', endError);
      }
      pool = null;
      db = null;
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