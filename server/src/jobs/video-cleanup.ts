import { config } from "../config.js";
import { deleteObject } from "../lib/oss.js";
import { prisma } from "../lib/prisma.js";

const CLEANUP_BATCH_SIZE = 20;

function deletionCutoff(now = new Date()) {
  return new Date(now.getTime() - config.VIDEO_DELETE_RETENTION_MINUTES * 60 * 1000);
}

export async function cleanupDeletedVideos(now = new Date()) {
  const candidates = await prisma.video.findMany({
    where: {
      deletedAt: {
        lte: deletionCutoff(now)
      }
    },
    orderBy: {
      deletedAt: "asc"
    },
    take: CLEANUP_BATCH_SIZE,
    select: {
      id: true,
      ossKey: true
    }
  });

  let deletedCount = 0;

  for (const video of candidates) {
    try {
      await deleteObject(video.ossKey);
    } catch (error) {
      console.error(`Failed to delete OSS object for video ${video.id}`, error);
      continue;
    }

    await prisma.video.delete({
      where: {
        id: video.id
      }
    });
    deletedCount += 1;
  }

  return {
    scannedCount: candidates.length,
    deletedCount
  };
}

export function startVideoCleanupJob() {
  const intervalMs = config.VIDEO_DELETE_CLEANUP_INTERVAL_MINUTES * 60 * 1000;

  const runCleanup = async () => {
    try {
      const result = await cleanupDeletedVideos();

      if (result.deletedCount > 0) {
        console.log(`Deleted ${result.deletedCount} videos from OSS and database`);
      }
    } catch (error) {
      console.error("Video cleanup job failed", error);
    }
  };

  const timeoutId = setTimeout(() => {
    void runCleanup();
  }, 10_000);
  const intervalId = setInterval(() => {
    void runCleanup();
  }, intervalMs);

  return () => {
    clearTimeout(timeoutId);
    clearInterval(intervalId);
  };
}
