import crypto from "node:crypto";
import path from "node:path";

import OSS from "ali-oss";

import { config } from "../config.js";

const SIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;
const SIGNED_READ_URL_EXPIRES_IN_SECONDS = 12 * 60 * 60;

function toClientObjectKey(objectKey: string) {
  return objectKey.replace(/^\/+/, "");
}

function createClient(endpoint = config.OSS_ENDPOINT) {
  return new OSS({
    region: config.OSS_REGION,
    bucket: config.OSS_BUCKET,
    endpoint,
    accessKeyId: config.OSS_ACCESS_KEY_ID,
    accessKeySecret: config.OSS_ACCESS_KEY_SECRET,
    authorizationV4: true
  });
}

export type UploadedOssPart = {
  number: number;
  etag: string;
};

export function buildStoredFilename(preferredName: string, originalFilename: string) {
  const normalizedPreferredName = preferredName.trim();
  const normalizedOriginalFilename = originalFilename.trim();
  const preferredExtension = path.extname(normalizedPreferredName);
  const originalExtension = path.extname(normalizedOriginalFilename).toLowerCase() || ".mp4";
  const storedFilename = preferredExtension ? normalizedPreferredName : `${normalizedPreferredName}${originalExtension}`;

  return storedFilename.replace(/[\\/]+/g, "-");
}

export function buildOssObjectKey(preferredName: string, originalFilename = preferredName) {
  const storedFilename = buildStoredFilename(preferredName, originalFilename);
  const extension = path.extname(storedFilename).toLowerCase() || ".mp4";
  const filenameHash = crypto.createHash("sha256").update(storedFilename).digest("hex");

  return `/upload/${filenameHash}${extension}`;
}

export async function initMultipartUpload(objectKey: string, mimeType: string) {
  const client = createClient();
  const result = await client.initMultipartUpload(toClientObjectKey(objectKey), {
    mime: mimeType
  });

  return result.uploadId as string;
}

export async function getSignedUploadPartUrl(objectKey: string, ossUploadId: string, partNumber: number) {
  const client = createClient(config.OSS_PUBLIC_ENDPOINT ?? config.OSS_ENDPOINT);
  const url = await client.signatureUrlV4(
    "PUT",
    SIGNED_URL_EXPIRES_IN_SECONDS,
    {
      queries: {
        partNumber,
        uploadId: ossUploadId
      }
    },
    toClientObjectKey(objectKey)
  );

  return {
    url,
    expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
    method: "PUT" as const
  };
}

export async function getSignedReadUrl(objectKey: string, expiresInSeconds = SIGNED_READ_URL_EXPIRES_IN_SECONDS) {
  const client = createClient(config.OSS_PUBLIC_ENDPOINT ?? config.OSS_ENDPOINT);
  const url = await client.signatureUrlV4("GET", expiresInSeconds, {}, toClientObjectKey(objectKey));

  return {
    url,
    expiresInSeconds,
    method: "GET" as const
  };
}

export async function getObjectStream(objectKey: string, range?: string) {
  const client = createClient();

  return client.getStream(
    toClientObjectKey(objectKey),
    range
      ? {
          headers: {
            Range: range
          }
        }
      : {}
  );
}

export async function getVideoSnapshotStream(objectKey: string) {
  const client = createClient();

  return client.getStream(toClientObjectKey(objectKey), {
    process: "video/snapshot,t_0,f_jpg,w_640,h_360,m_fast"
  });
}

export async function headObject(objectKey: string) {
  const client = createClient();

  return client.head(toClientObjectKey(objectKey));
}

export async function uploadMultipartPart(objectKey: string, ossUploadId: string, partNumber: number, chunk: Buffer) {
  const client = createClient();
  const result = await client.uploadPart(
    toClientObjectKey(objectKey),
    ossUploadId,
    partNumber,
    chunk,
    0,
    chunk.length
  );

  return (result.res.headers.etag as string | undefined)?.replaceAll('"', "").trim() ?? "";
}

export async function completeMultipartUpload(objectKey: string, ossUploadId: string, parts: UploadedOssPart[]) {
  const client = createClient();

  return client.completeMultipartUpload(toClientObjectKey(objectKey), ossUploadId, parts);
}

export async function abortMultipartUpload(objectKey: string, ossUploadId: string) {
  const client = createClient();

  return client.abortMultipartUpload(toClientObjectKey(objectKey), ossUploadId);
}

export async function deleteObject(objectKey: string) {
  const client = createClient();

  return client.delete(toClientObjectKey(objectKey));
}
