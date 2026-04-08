import { config } from "./config.js";
import { createApp } from "./app.js";
import { startVideoCleanupJob } from "./jobs/video-cleanup.js";

const app = createApp();
app.listen(config.PORT, () => {
  console.log(`videofly server running on http://localhost:${config.PORT}`);
});

startVideoCleanupJob();
