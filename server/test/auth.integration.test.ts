import { Role } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createPasswordResetToken, hashResetToken, verifyPassword } from "../src/lib/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { DEFAULT_UPLOAD_QUOTA_BYTES } from "../src/lib/users.js";
import { createAuthHeader, createUser, resetDatabase, seedAdmin } from "./helpers.js";

const app = createApp();

describe("auth and user management integration", () => {
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

  it("registers a user and stores a hashed password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "viewer@example.com", password: "Viewer1234" })
      .expect(201);

    expect(response.body.email).toBe("viewer@example.com");
    expect(response.body.role).toBe(Role.VIEWER);
    expect(response.body.uploadQuotaBytes).toBe(DEFAULT_UPLOAD_QUOTA_BYTES.toString());

    const user = await prisma.user.findUnique({
      where: { email: "viewer@example.com" }
    });

    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe("Viewer1234");
  });

  it("logs in and returns a JWT token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@videofly.local", password: "Admin123!" })
      .expect(200);

    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("admin@videofly.local");
    expect(response.body.user.role).toBe(Role.ADMIN);
  });

  it("rate limits registration attempts by IP", async () => {
    for (let index = 0; index < 5; index += 1) {
      await request(app)
        .post("/api/v1/auth/register")
        .set("X-Forwarded-For", "198.51.100.10")
        .send({ email: `viewer-rate-${index}@example.com`, password: "Viewer1234" })
        .expect(201);
    }

    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("X-Forwarded-For", "198.51.100.10")
      .send({ email: "viewer-rate-5@example.com", password: "Viewer1234" })
      .expect(429);

    expect(response.body.message).toBe("Too many registration attempts from this IP");
  });

  it("rate limits login attempts by IP", async () => {
    for (let index = 0; index < 10; index += 1) {
      await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", "198.51.100.11")
        .send({ email: "admin@videofly.local", password: "wrong-pass-123" })
        .expect(401);
    }

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.11")
      .send({ email: "admin@videofly.local", password: "Admin123!" })
      .expect(429);

    expect(response.body.message).toBe("Too many login attempts from this IP");
  });

  it("returns the current user for an authenticated request", async () => {
    const viewer = await createUser("viewer-me@example.com");

    const response = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", createAuthHeader(viewer))
      .expect(200);

    expect(response.body.email).toBe("viewer-me@example.com");
    expect(response.body.role).toBe(Role.VIEWER);
    expect(response.body.uploadQuotaBytes).toBe(DEFAULT_UPLOAD_QUOTA_BYTES.toString());
  });

  it("returns the current user's storage usage", async () => {
    const uploader = await createUser("viewer-storage@example.com", Role.UPLOADER);

    await prisma.video.createMany({
      data: [
        {
          title: "First",
          ossKey: "/upload/first.mp4",
          sizeBytes: BigInt(1024),
          status: "READY",
          uploaderId: uploader.id
        },
        {
          title: "Second",
          ossKey: "/upload/second.mp4",
          sizeBytes: BigInt(2048),
          status: "READY",
          uploaderId: uploader.id
        },
        {
          title: "Deleted",
          ossKey: "/upload/deleted.mp4",
          sizeBytes: BigInt(4096),
          status: "DELETED",
          deletedAt: new Date(),
          uploaderId: uploader.id
        }
      ]
    });

    const response = await request(app)
      .get("/api/v1/users/me/storage")
      .set("Authorization", createAuthHeader(uploader))
      .expect(200);

    expect(response.body.totalSizeBytes).toBe("3072");
    expect(response.body.reservedUploadBytes).toBe("0");
    expect(response.body.uploadQuotaBytes).toBe(DEFAULT_UPLOAD_QUOTA_BYTES.toString());
    expect(response.body.remainingQuotaBytes).toBe((DEFAULT_UPLOAD_QUOTA_BYTES - 3072n).toString());
    expect(response.body.videoCount).toBe(2);
  });

  it("restricts user listing to admins", async () => {
    const viewer = await createUser("viewer-list@example.com");

    await request(app)
      .get("/api/v1/users")
      .set("Authorization", createAuthHeader(viewer))
      .expect(403);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@videofly.local" }
    });

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", createAuthHeader(admin))
      .expect(200);

    expect(response.body.items).toHaveLength(2);
  });

  it("allows an admin to update another user's role", async () => {
    const viewer = await createUser("viewer-role@example.com");
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@videofly.local" }
    });

    const response = await request(app)
      .put(`/api/v1/users/${viewer.id}/role`)
      .set("Authorization", createAuthHeader(admin))
      .send({ role: Role.UPLOADER })
      .expect(200);

    expect(response.body.role).toBe(Role.UPLOADER);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: viewer.id }
    });

    expect(updated.role).toBe(Role.UPLOADER);
  });

  it("allows an admin to update another user's upload quota", async () => {
    const viewer = await createUser("viewer-quota@example.com");
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@videofly.local" }
    });

    const response = await request(app)
      .put(`/api/v1/users/${viewer.id}/quota`)
      .set("Authorization", createAuthHeader(admin))
      .send({ uploadQuotaBytes: "2147483648" })
      .expect(200);

    expect(response.body.uploadQuotaBytes).toBe("2147483648");

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: viewer.id }
    });

    expect(updated.uploadQuotaBytes).toBe(2147483648n);
  });

  it("creates a password reset record without leaking account existence", async () => {
    await createUser("viewer-reset@example.com");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const existing = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email: "viewer-reset@example.com" })
      .expect(200);

    const missing = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email: "missing@example.com" })
      .expect(200);

    expect(existing.body.message).toBe(missing.body.message);

    const tokens = await prisma.passwordResetToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
    consoleSpy.mockRestore();
  });

  it("rate limits password reset requests by IP", async () => {
    await createUser("viewer-reset-rate@example.com");

    for (let index = 0; index < 5; index += 1) {
      await request(app)
        .post("/api/v1/auth/reset-password")
        .set("X-Forwarded-For", "198.51.100.12")
        .send({ email: "viewer-reset-rate@example.com" })
        .expect(200);
    }

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .set("X-Forwarded-For", "198.51.100.12")
      .send({ email: "viewer-reset-rate@example.com" })
      .expect(429);

    expect(response.body.message).toBe("Too many password reset requests from this IP");
  });

  it("resets the password using a valid token", async () => {
    const user = await createUser("viewer-change@example.com");
    const { token, tokenHash } = createPasswordResetToken();

    await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        userId: user.id
      }
    });

    await request(app)
      .put("/api/v1/auth/reset-password")
      .send({ token, password: "NewPassword123" })
      .expect(200);

    const resetRecord = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash: hashResetToken(token) }
    });

    expect(resetRecord.usedAt).not.toBeNull();

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "viewer-change@example.com", password: "NewPassword123" })
      .expect(200);
  });

  it("allows an authenticated user to change their password", async () => {
    const user = await createUser("viewer-password-self@example.com");

    await request(app)
      .put("/api/v1/users/me/password")
      .set("Authorization", createAuthHeader(user))
      .send({
        currentPassword: "Viewer1234",
        newPassword: "Viewer5678"
      })
      .expect(200);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });

    expect(await verifyPassword("Viewer5678", updated.passwordHash)).toBe(true);

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "viewer-password-self@example.com", password: "Viewer5678" })
      .expect(200);
  });
});
