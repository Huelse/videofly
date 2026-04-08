import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  PASSWORD_RESET_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  PASSWORD_RESET_MAX_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(5)
});

export const config = schema.parse(process.env);
