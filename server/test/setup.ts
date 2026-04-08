import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

const testDatabaseUrl = new URL(process.env.DATABASE_URL!);
testDatabaseUrl.searchParams.set("schema", "integration_test");
process.env.DATABASE_URL = testDatabaseUrl.toString();
process.env.JWT_SECRET ??= "integration-secret";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.PORT ??= "3000";
