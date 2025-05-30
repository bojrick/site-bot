import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
export declare const getDb: () => ReturnType<typeof drizzle>;
export declare function testConnection(): Promise<boolean>;
export { schema };
//# sourceMappingURL=index.d.ts.map