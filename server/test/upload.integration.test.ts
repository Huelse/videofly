import { Role, VideoStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
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

    const partResponse = await request(app)
      .post("/api/v1/upload/part")
      .set("Authorization", createAuthHeader(uploader))
      .send({
        uploadId,
        partNumber: 1
      })
      .expect(200);

    expect(partResponse.body.status).toBe(UPLOAD_SESSION_STATUS.UPLOADING);
    expect(partResponse.body.uploadedParts).toEqual([1]);

    const statusResponse = await request(app)
      .get(`/api/v1/upload/status/${uploadId}`)
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(statusResponse.body.uploadedParts).toEqual([1]);

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
    expect(video.ossKey).toContain(uploadId);

    const detailResponse = await request(app)
      .get(`/api/v1/videos/${video.id}`)
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(detailResponse.body.id).toBe(video.id);
    expect(detailResponse.body.ossKey).toContain(uploadId);
    expect(detailResponse.body.sizeBytes).toBe("20971520");
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
