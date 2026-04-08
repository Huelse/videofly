import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { videoRouter } from "./routes/videos.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1", videoRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(config.PORT, () => {
  console.log(`videofly server running on http://localhost:${config.PORT}`);
});
