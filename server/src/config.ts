import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function toPublicOssEndpoint(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = normalizeUrl(value);
  if (typeof normalized !== "string") {
    return normalized;
  }

  return normalized.replace(".aliyuncs.com", ".aliyuncs.com").replace("-internal.aliyuncs.com", ".aliyuncs.com");
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_RATE_LIMIT_REGISTER_MAX_REQUESTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_LOGIN_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_RESET_PASSWORD_MAX_REQUESTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  PASSWORD_RESET_MAX_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(5),
  VIDEO_DELETE_RETENTION_MINUTES: z.coerce.number().int().positive().default(10),
  VIDEO_DELETE_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  OSS_REGION: z.string().min(1).default("oss-cn-shanghai"),
  OSS_BUCKET: z.string().min(1).default("videofly-dev"),
  OSS_ENDPOINT: z.preprocess(normalizeUrl, z.string().url()).default("https://oss-cn-shanghai.aliyuncs.com"),
  OSS_PUBLIC_ENDPOINT: z.preprocess(toPublicOssEndpoint, z.string().url()).optional(),
  OSS_ACCESS_KEY_ID: z.string().min(1).default("replace-me"),
  OSS_ACCESS_KEY_SECRET: z.string().min(1).default("replace-me")
});

const parsedConfig = schema.parse(process.env);

export const config = {
  ...parsedConfig,
  OSS_PUBLIC_ENDPOINT:
    parsedConfig.OSS_PUBLIC_ENDPOINT ??
    (toPublicOssEndpoint(parsedConfig.OSS_ENDPOINT) as string)
};
