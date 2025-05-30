import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy initialization of the pool
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Function to get or create the database connection
function getDatabase() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
    db = drizzle(pool, { schema });
  }
  return { pool, db };
}

// Export the database instance with lazy loading
export const getDb = () => getDatabase().db!;

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