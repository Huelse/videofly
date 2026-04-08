-- CreateEnum
CREATE TYPE "UploadSessionStatus" AS ENUM ('INITIATED', 'UPLOADING', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "ossKey" TEXT,
    "partSizeBytes" INTEGER NOT NULL,
    "uploadedParts" JSONB NOT NULL DEFAULT '[]',
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'INITIATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploaderId" TEXT NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_uploadId_key" ON "UploadSession"("uploadId");

-- CreateIndex
CREATE INDEX "UploadSession_uploaderId_createdAt_idx" ON "UploadSession"("uploaderId", "createdAt");

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
