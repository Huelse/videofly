import cors from "cors";
import express from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { HttpError } from "./lib/errors.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { userRouter } from "./routes/users.js";
import { videoRouter } from "./routes/videos.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/v1", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", userRouter);
  app.use("/api/v1", videoRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        issues: error.issues
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ message: "Resource not found" });
    }

    return res.status(500).json({ message: "Internal server error" });
  });

  return app;
}
