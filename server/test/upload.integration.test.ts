import crypto from "node:crypto";

import { Role, VideoStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import * as oss from "../src/lib/oss.js";
import { buildOssObjectKey } from "../src/lib/oss.js";
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

  it("blocks upload initialization when the user's quota would be exceeded", async () => {
    const uploader = await createUser("uploader-quota-blocked@example.com", Role.UPLOADER, 1024n);

    await prisma.video.create({
      data: {
        title: "Existing",
        ossKey: "/upload/existing-quota.mp4",
        sizeBytes: 700n,
        status: VideoStatus.READY,
        uploaderId: uploader.id
      }
    });

    await (prisma as typeof prisma & { uploadSession: any }).uploadSession.create({
      data: {
        title: "Pending",
        filename: "pending.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 200n,
        uploadId: crypto.randomUUID(),
        ossKey: "/upload/pending.mp4",
        ossUploadId: "pending-oss-upload-id",
        partSizeBytes: 8 * 1024 * 1024,
        status: "INITIATED",
        uploaderId: uploader.id
      }
    });

    const response = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Too large",
        filename: "too-large.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "200"
      })
      .expect(409);

    expect(response.body.message).toBe("Upload quota exceeded. Remaining quota is 124 bytes");
    expect(oss.abortMultipartUpload).toHaveBeenCalledWith(buildOssObjectKey("Too large", "too-large.mp4"), "oss-upload-id");
  });

  it("completes upload successfully when a soft-deleted video exists for the same filename", async () => {
    const uploader = await createUser("uploader-soft-deleted@example.com", Role.UPLOADER);
    const filename = "reupload-demo.mp4";

    await prisma.video.create({
      data: {
        title: "Old deleted demo",
        ossKey: buildOssObjectKey(filename),
        sizeBytes: BigInt(2048),
        status: VideoStatus.DELETED,
        deletedAt: new Date(),
        uploaderId: uploader.id
      }
    });

    const initResponse = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Replacement demo",
        filename,
        mimeType: "video/mp4",
        fileSizeBytes: "8388608"
      })
      .expect(201);

    const uploadId = initResponse.body.uploadId as string;
    const partBuffer = Buffer.alloc(8 * 1024 * 1024, "z");
    const checksum = crypto.createHash("sha256").update(partBuffer).digest("hex");

    await request(app)
      .put(`/api/v1/upload/part/upload?uploadId=${uploadId}&partNumber=1`)
      .set("Authorization", createAuthHeader(uploader))
      .set("x-part-sha256", checksum)
      .set("Content-Type", "application/octet-stream")
      .send(partBuffer)
      .expect(200);

    const completeResponse = await request(app)
      .post("/api/v1/upload/complete")
      .set("Authorization", createAuthHeader(uploader))
      .send({ uploadId })
      .expect(201);

    expect(completeResponse.body.title).toBe("Replacement demo");

    const videos = await prisma.video.findMany({
      where: {
        ossKey: buildOssObjectKey(filename)
      }
    });

    expect(videos).toHaveLength(1);
    expect(videos[0].status).toBe(VideoStatus.READY);
    expect(videos[0].deletedAt).toBeNull();
  });

  it("uses the custom title as the primary stored filename key", async () => {
    const uploader = await createUser("uploader-custom-title@example.com", Role.UPLOADER);

    await prisma.video.create({
      data: {
        title: "Existing custom title",
        ossKey: buildOssObjectKey("My custom title", "origin-a.mp4"),
        sizeBytes: 2048n,
        status: VideoStatus.READY,
        uploaderId: uploader.id
      }
    });

    await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Another custom title",
        filename: "origin-a.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "1024"
      })
      .expect(201);

    await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "My custom title",
        filename: "origin-b.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "1024"
      })
      .expect(409);
  });

  it("recovers completion when oss multipart has already been finalized", async () => {
    const uploader = await createUser("uploader-complete-recover@example.com", Role.UPLOADER);

    vi.spyOn(oss, "completeMultipartUpload").mockRejectedValueOnce(new Error("NoSuchUpload"));
    vi.spyOn(oss, "headObject").mockResolvedValueOnce({
      status: 200,
      res: { headers: {} }
    } as never);

    const initResponse = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Recover complete",
        filename: "recover-complete.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "8388608"
      })
      .expect(201);

    const uploadId = initResponse.body.uploadId as string;
    const partBuffer = Buffer.alloc(8 * 1024 * 1024, "r");
    const checksum = crypto.createHash("sha256").update(partBuffer).digest("hex");

    await request(app)
      .put(`/api/v1/upload/part/upload?uploadId=${uploadId}&partNumber=1`)
      .set("Authorization", createAuthHeader(uploader))
      .set("x-part-sha256", checksum)
      .set("Content-Type", "application/octet-stream")
      .send(partBuffer)
      .expect(200);

    const completeResponse = await request(app)
      .post("/api/v1/upload/complete")
      .set("Authorization", createAuthHeader(uploader))
      .send({ uploadId })
      .expect(201);

    expect(completeResponse.body.title).toBe("Recover complete");
    expect(oss.headObject).toHaveBeenCalledWith(buildOssObjectKey("recover-complete.mp4"));
  });

  it("resets the upload session when oss multipart has expired before completion", async () => {
    const uploader = await createUser("uploader-expired-complete@example.com", Role.UPLOADER);

    vi.spyOn(oss, "completeMultipartUpload").mockRejectedValueOnce(
      Object.assign(new Error("NoSuchUpload"), {
        code: "NoSuchUpload"
      })
    );
    vi.spyOn(oss, "headObject").mockRejectedValueOnce(new Error("NotFound"));
    vi.spyOn(oss, "initMultipartUpload")
      .mockResolvedValueOnce("oss-upload-id")
      .mockResolvedValueOnce("replacement-oss-upload-id");

    const initResponse = await request(app)
      .post("/api/v1/upload/init")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        title: "Expired complete",
        filename: "expired-complete.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: "8388608"
      })
      .expect(201);

    const uploadId = initResponse.body.uploadId as string;
    const partBuffer = Buffer.alloc(8 * 1024 * 1024, "x");
    const checksum = crypto.createHash("sha256").update(partBuffer).digest("hex");

    await request(app)
      .put(`/api/v1/upload/part/upload?uploadId=${uploadId}&partNumber=1`)
      .set("Authorization", createAuthHeader(uploader))
      .set("x-part-sha256", checksum)
      .set("Content-Type", "application/octet-stream")
      .send(partBuffer)
      .expect(200);

    const completeResponse = await request(app)
      .post("/api/v1/upload/complete")
      .set("Authorization", createAuthHeader(uploader))
      .send({ uploadId })
      .expect(409);

    expect(completeResponse.body.message).toBe("Upload session expired in OSS. Please continue upload to resend all parts.");

    const refreshedSession = await (prisma as typeof prisma & { uploadSession: any }).uploadSession.findUniqueOrThrow({
      where: { uploadId }
    });

    expect(refreshedSession.status).toBe("INITIATED");
    expect(refreshedSession.ossUploadId).toBe("replacement-oss-upload-id");
    expect(refreshedSession.uploadedParts).toEqual([]);
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
