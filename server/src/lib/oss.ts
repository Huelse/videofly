import OSS from "ali-oss";

import { config } from "../config.js";

const SIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;

type OssPart = {
  PartNumber?: number | string;
  ETag?: string;
};

function createClient() {
  return new OSS({
    region: config.OSS_REGION,
    bucket: config.OSS_BUCKET,
    endpoint: config.OSS_ENDPOINT,
    accessKeyId: config.OSS_ACCESS_KEY_ID,
    accessKeySecret: config.OSS_ACCESS_KEY_SECRET,
    authorizationV4: true
  });
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function normalizePartNumberMarker(marker: unknown) {
  if (marker === undefined || marker === null || marker === "") {
    return undefined;
  }

  return Number(marker);
}

export type UploadedOssPart = {
  number: number;
  etag: string;
};

export function buildOssObjectKey(userId: string, uploadId: string, filename: string) {
  return `videos/${userId}/${uploadId}/${sanitizeFilename(filename)}`;
}

export async function initMultipartUpload(objectKey: string, mimeType: string) {
  const client = createClient();
  const result = await client.initMultipartUpload(objectKey, {
    mime: mimeType
  });

  return result.uploadId as string;
}

export async function getSignedUploadPartUrl(objectKey: string, ossUploadId: string, partNumber: number) {
  const client = createClient();
  const url = await client.signatureUrlV4(
    "PUT",
    SIGNED_URL_EXPIRES_IN_SECONDS,
    {
      queries: {
        partNumber,
        uploadId: ossUploadId
      }
    },
    objectKey
  );

  return {
    url,
    expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
    method: "PUT" as const
  };
}

export async function listUploadedParts(objectKey: string, ossUploadId: string) {
  const client = createClient();
  const uploadedParts: UploadedOssPart[] = [];
  let marker: number | undefined;

  do {
    const result = await client.listParts(
      objectKey,
      ossUploadId,
      marker
        ? {
            "part-number-marker": marker
          }
        : {}
    );

    const parts = (Array.isArray(result.parts) ? result.parts : []) as OssPart[];

    uploadedParts.push(
      ...parts
        .map((part) => {
          const typedPart = part as OssPart;

          return {
            number: Number(typedPart.PartNumber),
            etag: typedPart.ETag ?? ""
          };
        })
        .filter((part: UploadedOssPart) => Number.isInteger(part.number) && part.number > 0 && part.etag)
    );

    marker = normalizePartNumberMarker(result.nextPartNumberMarker);
  } while (marker);

  return uploadedParts.sort((a, b) => a.number - b.number);
}

export async function completeMultipartUpload(objectKey: string, ossUploadId: string, parts: UploadedOssPart[]) {
  const client = createClient();

  return client.completeMultipartUpload(objectKey, ossUploadId, parts);
}

export async function abortMultipartUpload(objectKey: string, ossUploadId: string) {
  const client = createClient();

  return client.abortMultipartUpload(objectKey, ossUploadId);
}
