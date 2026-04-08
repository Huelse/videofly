import NodeCache from "node-cache";
import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/errors.js";

const ipRateLimitCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 30,
  useClones: false
});

type IpRateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
  message: string;
};

function getClientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createIpRateLimiter(options: IpRateLimitOptions) {
  const { keyPrefix, limit, windowSeconds, message } = options;

  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const currentCount = ipRateLimitCache.get<number>(key) ?? 0;

    if (currentCount >= limit) {
      return next(new HttpError(429, message));
    }

    ipRateLimitCache.set(key, currentCount + 1, windowSeconds);
    return next();
  };
}
