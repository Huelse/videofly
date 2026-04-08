import { Readable } from "node:stream";

import { Role, VideoStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { cleanupDeletedVideos } from "../src/jobs/video-cleanup.js";
import * as oss from "../src/lib/oss.js";
import { prisma } from "../src/lib/prisma.js";
import { createAuthHeader, createUser, resetDatabase, seedAdmin } from "./helpers.js";

const app = createApp();

describe("videos integration", () => {
  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(oss, "getObjectStream").mockImplementation(async (objectKey, range) => ({
      stream: Readable.from([`video:${objectKey}:${range ?? "full"}`]),
      res: {
        status: range ? 206 : 200,
        headers: {
          "content-type": "video/mp4",
          ...(range ? { "content-range": "bytes 0-23/24" } : {})
        }
      }
    }));
    vi.spyOn(oss, "getVideoSnapshotStream").mockImplementation(async (objectKey) => ({
      stream: Readable.from([`preview:${objectKey}`]),
      res: {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          etag: "preview-etag"
        }
      }
    }));
    vi.spyOn(oss, "deleteObject").mockResolvedValue({} as never);
    await resetDatabase();
    await seedAdmin();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("lists active videos with playback urls and hides soft-deleted records", async () => {
    const uploader = await createUser("video-list@example.com", Role.UPLOADER);

    const activeVideo = await prisma.video.create({
      data: {
        title: "Active demo",
        ossKey: "/upload/active-demo.mp4",
        sizeBytes: BigInt(1024),
        status: VideoStatus.READY,
        uploaderId: uploader.id
      }
    });

    await prisma.video.create({
      data: {
        title: "Deleted demo",
        ossKey: "/upload/deleted-demo.mp4",
        sizeBytes: BigInt(2048),
        status: VideoStatus.DELETED,
        deletedAt: new Date(),
        uploaderId: uploader.id
      }
    });

    const response = await request(app)
      .get("/api/v1/videos?scope=mine")
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: activeVideo.id,
      title: "Active demo",
      playbackUrl: `/api/v1/videos/${activeVideo.id}/playback`
    });
  });

  it("streams playback through the api for authenticated users", async () => {
    const uploader = await createUser("video-playback@example.com", Role.UPLOADER);
    const token = createAuthHeader(uploader).slice(7);
    const video = await prisma.video.create({
      data: {
        title: "Playback demo",
        ossKey: "/upload/playback-demo.mp4",
        sizeBytes: BigInt(8192),
        status: VideoStatus.READY,
        uploaderId: uploader.id
      }
    });

    const response = await request(app)
      .get(`/api/v1/videos/${video.id}/playback?token=${encodeURIComponent(token)}`)
      .set("Range", "bytes=0-23")
      .expect(206);

    expect(response.headers["content-type"]).toBe("video/mp4");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(oss.getObjectStream).toHaveBeenCalledWith("/upload/playback-demo.mp4", "bytes=0-23");
  });

  it("streams preview images through the api with cache headers", async () => {
    const uploader = await createUser("video-preview@example.com", Role.UPLOADER);
    const token = createAuthHeader(uploader).slice(7);
    const video = await prisma.video.create({
      data: {
        title: "Preview demo",
        ossKey: "/upload/preview-demo.mp4",
        sizeBytes: BigInt(8192),
        status: VideoStatus.READY,
        uploaderId: uploader.id
      }
    });

    const response = await request(app)
      .get(`/api/v1/videos/${video.id}/preview?token=${encodeURIComponent(token)}`)
      .expect(200);

    expect(response.headers["content-type"]).toBe("image/jpeg");
    expect(response.headers["cache-control"]).toContain("max-age=86400");
    expect(oss.getVideoSnapshotStream).toHaveBeenCalledWith("/upload/preview-demo.mp4");
  });

  it("soft deletes videos instead of removing them immediately", async () => {
    const uploader = await createUser("video-delete@example.com", Role.UPLOADER);
    const video = await prisma.video.create({
      data: {
        title: "Delete me",
        ossKey: "/upload/delete-me.mp4",
        sizeBytes: BigInt(4096),
        status: VideoStatus.READY,
        uploaderId: uploader.id
      }
    });

    await request(app)
      .delete(`/api/v1/videos/${video.id}`)
      .set("Authorization", createAuthHeader(uploader))
      .expect(204);

    const deletedVideo = await prisma.video.findUniqueOrThrow({
      where: { id: video.id }
    });

    expect(deletedVideo.status).toBe(VideoStatus.DELETED);
    expect(deletedVideo.deletedAt).not.toBeNull();
  });

  it("removes soft-deleted videos from OSS and database during cleanup", async () => {
    const uploader = await createUser("video-cleanup@example.com", Role.UPLOADER);
    const oldDeletedAt = new Date(Date.now() - 30 * 60 * 1000);
    const video = await prisma.video.create({
      data: {
        title: "Cleanup me",
        ossKey: "/upload/cleanup-me.mp4",
        sizeBytes: BigInt(8192),
        status: VideoStatus.DELETED,
        deletedAt: oldDeletedAt,
        uploaderId: uploader.id
      }
    });

    const result = await cleanupDeletedVideos(new Date());

    expect(result.deletedCount).toBe(1);
    expect(oss.deleteObject).toHaveBeenCalledWith("/upload/cleanup-me.mp4");
    await expect(
      prisma.video.findUniqueOrThrow({
        where: { id: video.id }
      })
    ).rejects.toThrow();
  });
});
