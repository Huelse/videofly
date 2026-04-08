type UploadWorkerRequest = {
  type: "upload";
  partNumber: number;
  chunk: Blob;
  method: "PUT";
  url: string;
  token: string;
  contentType: string;
  maxAttempts?: number;
};

type UploadWorkerSuccess = {
  type: "success";
  partNumber: number;
  session: {
    uploadId: string;
    status: string;
    partSizeBytes: number;
    fileSizeBytes?: string;
    uploadedParts?: number[];
  };
};

type UploadWorkerError = {
  type: "error";
  partNumber: number;
  attempts: number;
  message: string;
};

function respond(message: UploadWorkerSuccess | UploadWorkerError) {
  self.postMessage(message);
}

async function sha256Hex(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

self.onmessage = async (event: MessageEvent<UploadWorkerRequest>) => {
  const payload = event.data;

  if (!payload || payload.type !== "upload") {
    return;
  }

  const maxAttempts = payload.maxAttempts ?? 3;
  let lastError = "Part upload failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const checksum = await sha256Hex(payload.chunk);
      const response = await fetch(payload.url, {
        method: payload.method,
        body: payload.chunk,
        headers: {
          Authorization: `Bearer ${payload.token}`,
          "Content-Type": payload.contentType,
          "x-part-sha256": checksum
        }
      });

      if (!response.ok) {
        const text = await response.text();
        let message = `Part upload failed with status ${response.status}`;

        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) {
            message = parsed.message;
          }
        } catch {
          if (text) {
            message = text;
          }
        }

        throw new Error(message);
      }

      const session = (await response.json()) as UploadWorkerSuccess["session"];

      respond({
        type: "success",
        partNumber: payload.partNumber,
        session
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Part upload failed";

      if (attempt >= maxAttempts) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }

  respond({
    type: "error",
    partNumber: payload.partNumber,
    attempts: maxAttempts,
    message: `Part ${payload.partNumber} upload failed after ${maxAttempts} attempts: ${lastError}`
  });
};
