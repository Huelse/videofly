import crypto from "node:crypto";

import { Role, VideoStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import * as oss from "../src/lib/oss.js";
import { prisma } from "../src/lib/prisma.js";
import { createAuthHeader, createUser, resetDatabase, seedAdmin } from "./helpers.js";

const app = createApp();
const UPLOAD_SESSION_STATUS = {
  INITIATED: "INITIATED",
  UPLOADING: "UPLOADING",
  CANCELED: "CANCELED"
} as const;

describe("upload integration", () => {
  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(oss, "initMultipartUpload").mockResolvedValue("oss-upload-id");
    vi.spyOn(oss, "uploadMultipartPart").mockImplementation(async (_objectKey, _ossUploadId, partNumber) => `etag-${partNumber}`);
    vi.spyOn(oss, "completeMultipartUpload").mockResolvedValue({} as never);
    vi.spyOn(oss, "abortMultipartUpload").mockResolvedValue({} as never);
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

  it("blocks viewers from initializing uploads", async () => {
    const viewer = await createUser("viewer-upload-blocked@example.com", Role.VIEWER);

    await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(viewer))
      .send({
        title: "Blocked video",
        filename: "blocked.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "1024"
      })
      .expect(403);
  });

  it("allows uploaders to initialize, upload parts, inspect status and complete uploads", async () => {
    const uploader = await createUser("uploader@example.com", Role.UPLOADER);

    const initResponse = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Product demo",
        filename: "demo.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "20971520"
      })
      .expect(201);

    expect(initResponse.body.status).toBe(UPLOAD_SESSION_STATUS.INITIATED);

    const uploadId = initResponse.body.uploadId as string;
    const partBuffers = [
      Buffer.alloc(8 * 1024 * 1024, "a"),
      Buffer.alloc(8 * 1024 * 1024, "b"),
      Buffer.alloc(4 * 1024 * 1024, "c")
    ];

    for (const [index, partBuffer] of partBuffers.entries()) {
      const partNumber = index + 1;
      const checksum = crypto.createHash("sha256").update(partBuffer).digest("hex");

      await request(app)
        .put(`/api/v1/upload/part/upload?uploadId=${uploadId}&partNumber=${partNumber}`)
        .set("Authorization", createAuthHeader(uploader))
        .set("x-part-sha256", checksum)
        .set("Content-Type", "application/octet-stream")
        .send(partBuffer)
        .expect(200);
    }

    const statusResponse = await request(app)
      .get(`/api/v1/upload/status/${uploadId}`)
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(statusResponse.body.uploadedParts).toEqual([1, 2, 3]);

    const completeResponse = await request(app)
      .post("/api/v1/upload/complete")
      .set("Authorization", createAuthHeader(uploader))
      .send({ uploadId })
      .expect(201);

    expect(completeResponse.body.title).toBe("Product demo");
    expect(completeResponse.body.status).toBe(VideoStatus.READY);

    const video = await prisma.video.findUniqueOrThrow({
      where: { id: completeResponse.body.id }
    });

    expect(video.uploaderId).toBe(uploader.id);
    expect(video.ossKey).toContain("/upload/");

    const detailResponse = await request(app)
      .get(`/api/v1/videos/${video.id}`)
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(detailResponse.body.id).toBe(video.id);
    expect(detailResponse.body.ossKey).toContain("/upload/");
    expect(detailResponse.body.sizeBytes).toBe("20971520");
  });

  it("keeps all uploaded parts when the last batch is uploaded concurrently", async () => {
    const uploader = await createUser("uploader-concurrent@example.com", Role.UPLOADER);

    const initResponse = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Concurrent demo",
        filename: "concurrent-demo.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: String(4 * 8 * 1024 * 1024)
      })
      .expect(201);

    const uploadId = initResponse.body.uploadId as string;
    const partBuffers = [
      Buffer.alloc(8 * 1024 * 1024, "d"),
      Buffer.alloc(8 * 1024 * 1024, "e"),
      Buffer.alloc(8 * 1024 * 1024, "f"),
      Buffer.alloc(8 * 1024 * 1024, "g")
    ];

    await Promise.all(
      partBuffers.map(async (partBuffer, index) => {
        const partNumber = index + 1;
        const checksum = crypto.createHash("sha256").update(partBuffer).digest("hex");

        await request(app)
          .put(`/api/v1/upload/part/upload?uploadId=${uploadId}&partNumber=${partNumber}`)
          .set("Authorization", createAuthHeader(uploader))
          .set("x-part-sha256", checksum)
          .set("Content-Type", "application/octet-stream")
          .send(partBuffer)
          .expect(200);
      })
    );

    const statusResponse = await request(app)
      .get(`/api/v1/upload/status/${uploadId}`)
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(statusResponse.body.uploadedParts).toEqual([1, 2, 3, 4]);
  });

  it("allows canceling an upload session", async () => {
    const uploader = await createUser("uploader-cancel@example.com", Role.UPLOADER);

    const initResponse = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Cancel demo",
        filename: "cancel.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "5120"
      })
      .expect(201);

    const cancelResponse = await request(app)
      .delete("/api/v1/upload/cancel")
      .set("Authorization", createAuthHeader(uploader))
      .send({ uploadId: initResponse.body.uploadId })
      .expect(200);

    expect(cancelResponse.body.status).toBe(UPLOAD_SESSION_STATUS.CANCELED);
  });
});
