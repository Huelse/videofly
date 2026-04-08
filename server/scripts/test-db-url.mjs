import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("schema", "integration_test");

process.stdout.write(url.toString());
