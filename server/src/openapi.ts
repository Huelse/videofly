type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const roleEnum = ["VIEWER", "UPLOADER", "ADMIN"] as const;
const videoStatusEnum = ["PENDING", "PROCESSING", "READY", "FAILED", "DELETED"] as const;
const uploadSessionStatusEnum = ["INITIATED", "UPLOADING", "COMPLETED", "CANCELED"] as const;

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` } as const;
}

function jsonContent(schema: JsonValue, example?: JsonValue) {
  return {
    "application/json": {
      schema,
      ...(example === undefined ? {} : { example })
    }
  };
}

function binaryContent(contentType: string) {
  return {
    [contentType]: {
      schema: {
        type: "string",
        format: "binary"
      }
    }
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: jsonContent(ref("ErrorResponse"))
  };
}

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Videofly API",
    version: "0.0.1",
    description: "Videofly backend API for authentication, user management, video uploads, and video playback."
  },
  servers: [
    {
      url: "/",
      description: "Current deployment origin"
    }
  ],
  tags: [
    { name: "Health", description: "Service health checks" },
    { name: "Auth", description: "Authentication and password reset" },
    { name: "Users", description: "Current user profile and admin user management" },
    { name: "Upload", description: "Multipart upload workflow for video files" },
    { name: "Videos", description: "Video listing, detail, deletion, playback, and preview" }
  ],
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Get service health",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service is healthy",
            content: jsonContent(ref("HealthResponse"))
          }
        }
      }
    },
    "/api/v1/openapi.json": {
      get: {
        tags: ["Health"],
        summary: "Get OpenAPI JSON document",
        operationId: "getOpenApiJson",
        responses: {
          "200": {
            description: "OpenAPI document in JSON format",
            content: jsonContent({
              type: "object",
              additionalProperties: true
            })
          }
        }
      }
    },
    "/api/v1/openapi.yaml": {
      get: {
        tags: ["Health"],
        summary: "Get OpenAPI YAML document",
        operationId: "getOpenApiYaml",
        responses: {
          "200": {
            description: "OpenAPI document in YAML format",
            content: {
              "application/yaml": {
                schema: {
                  type: "string"
                }
              },
              "text/yaml": {
                schema: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        operationId: "register",
        requestBody: {
          required: true,
          content: jsonContent(ref("RegisterRequest"))
        },
        responses: {
          "201": {
            description: "User created",
            content: jsonContent(ref("User"))
          },
          "400": errorResponse("Validation failed"),
          "409": errorResponse("Email already exists")
        }
      }
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with email and password",
        operationId: "login",
        requestBody: {
          required: true,
          content: jsonContent(ref("LoginRequest"))
        },
        responses: {
          "200": {
            description: "Authenticated session",
            content: jsonContent(ref("LoginResponse"))
          },
          "400": errorResponse("Validation failed"),
          "401": errorResponse("Invalid credentials")
        }
      }
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out the current user",
        operationId: "logout",
        security: [{ BearerAuth: [] }],
        responses: {
          "204": {
            description: "Logged out"
          },
          "401": errorResponse("Authentication required")
        }
      }
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset link",
        operationId: "requestPasswordReset",
        requestBody: {
          required: true,
          content: jsonContent(ref("PasswordResetRequest"))
        },
        responses: {
          "200": {
            description: "Password reset flow initiated",
            content: jsonContent(ref("MessageResponse"))
          },
          "400": errorResponse("Validation failed"),
          "429": errorResponse("Too many reset attempts")
        }
      },
      put: {
        tags: ["Auth"],
        summary: "Reset password with token",
        operationId: "resetPassword",
        requestBody: {
          required: true,
          content: jsonContent(ref("ResetPasswordRequest"))
        },
        responses: {
          "200": {
            description: "Password updated",
            content: jsonContent(ref("MessageResponse"))
          },
          "400": errorResponse("Validation failed or token is invalid")
        }
      }
    },
    "/api/v1/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get current user profile",
        operationId: "getCurrentUser",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: jsonContent(ref("User"))
          },
          "401": errorResponse("Authentication required"),
          "404": errorResponse("User not found")
        }
      }
    },
    "/api/v1/users/me/storage": {
      get: {
        tags: ["Users"],
        summary: "Get current user storage usage",
        operationId: "getCurrentUserStorage",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Storage usage",
            content: jsonContent(ref("StorageUsage"))
          },
          "401": errorResponse("Authentication required"),
          "404": errorResponse("User not found")
        }
      }
    },
    "/api/v1/users/me/password": {
      put: {
        tags: ["Users"],
        summary: "Change current user password",
        operationId: "changeCurrentUserPassword",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: jsonContent(ref("ChangePasswordRequest"))
        },
        responses: {
          "200": {
            description: "Password updated",
            content: jsonContent(ref("MessageResponse"))
          },
          "400": errorResponse("Validation failed or current password is incorrect"),
          "401": errorResponse("Authentication required"),
          "404": errorResponse("User not found")
        }
      }
    },
    "/api/v1/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        description: "Admin only.",
        operationId: "listUsers",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            }
          },
          {
            name: "pageSize",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            }
          }
        ],
        responses: {
          "200": {
            description: "Paginated users",
            content: jsonContent(ref("UserListResponse"))
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions")
        }
      }
    },
    "/api/v1/users/{id}/role": {
      put: {
        tags: ["Users"],
        summary: "Update a user's role",
        description: "Admin only.",
        operationId: "updateUserRole",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          }
        ],
        requestBody: {
          required: true,
          content: jsonContent(ref("UpdateUserRoleRequest"))
        },
        responses: {
          "200": {
            description: "Updated user",
            content: jsonContent(ref("User"))
          },
          "400": errorResponse("Validation failed"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Resource not found")
        }
      }
    },
    "/api/v1/users/{id}/quota": {
      put: {
        tags: ["Users"],
        summary: "Update a user's upload quota",
        description: "Admin only.",
        operationId: "updateUserQuota",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          }
        ],
        requestBody: {
          required: true,
          content: jsonContent(ref("UpdateUserQuotaRequest"))
        },
        responses: {
          "200": {
            description: "Updated user",
            content: jsonContent(ref("User"))
          },
          "400": errorResponse("Validation failed"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Resource not found")
        }
      }
    },
    "/api/v1/upload/init": {
      post: {
        tags: ["Upload"],
        summary: "Initialize a multipart upload",
        description: "Uploader and admin only.",
        operationId: "initUpload",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: jsonContent(ref("InitUploadRequest"))
        },
        responses: {
          "201": {
            description: "Upload session created",
            content: jsonContent(ref("UploadSession"))
          },
          "400": errorResponse("Validation failed or unsupported video type"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("User not found"),
          "409": errorResponse("Quota exceeded or filename conflict")
        }
      }
    },
    "/api/v1/upload/part": {
      post: {
        tags: ["Upload"],
        summary: "Mark a multipart upload as in progress",
        description: "Uploader and admin only.",
        operationId: "prepareUploadPart",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: jsonContent(ref("UploadPartRequest"))
        },
        responses: {
          "200": {
            description: "Upload session state updated",
            content: jsonContent(ref("UploadPartStatusResponse"))
          },
          "400": errorResponse("Upload session cannot accept parts"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Upload session not found")
        }
      }
    },
    "/api/v1/upload/part/upload": {
      put: {
        tags: ["Upload"],
        summary: "Upload a single binary part",
        description: "Uploader and admin only. Send raw bytes in the request body.",
        operationId: "uploadPartBinary",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "uploadId",
            in: "query",
            required: true,
            schema: {
              type: "string"
            }
          },
          {
            name: "partNumber",
            in: "query",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            }
          },
          {
            name: "x-part-sha256",
            in: "header",
            required: true,
            schema: {
              type: "string"
            },
            description: "Lowercase SHA-256 checksum of the raw chunk."
          }
        ],
        requestBody: {
          required: true,
          content: binaryContent("application/octet-stream")
        },
        responses: {
          "200": {
            description: "Upload session updated with uploaded part",
            content: jsonContent(ref("UploadSession"))
          },
          "400": errorResponse("Invalid chunk or checksum"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Upload session not found"),
          "500": errorResponse("Upload session metadata missing"),
          "502": errorResponse("OSS upload failed")
        }
      }
    },
    "/api/v1/upload/complete": {
      post: {
        tags: ["Upload"],
        summary: "Complete a multipart upload",
        description: "Uploader and admin only.",
        operationId: "completeUpload",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: jsonContent(ref("CompleteUploadRequest"))
        },
        responses: {
          "201": {
            description: "Video created",
            content: jsonContent(ref("UploadedVideo"))
          },
          "400": errorResponse("Upload is incomplete or cannot be completed"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Upload session not found"),
          "409": errorResponse("Upload session expired in OSS")
        }
      }
    },
    "/api/v1/upload/cancel": {
      delete: {
        tags: ["Upload"],
        summary: "Cancel a multipart upload",
        description: "Uploader and admin only.",
        operationId: "cancelUpload",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: jsonContent(ref("CancelUploadRequest"))
        },
        responses: {
          "200": {
            description: "Upload canceled",
            content: jsonContent(ref("CanceledUpload"))
          },
          "400": errorResponse("Validation failed"),
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Upload session not found")
        }
      }
    },
    "/api/v1/upload/history": {
      get: {
        tags: ["Upload"],
        summary: "List recent upload sessions",
        description: "Uploader and admin only.",
        operationId: "listUploadHistory",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Upload history",
            content: jsonContent(ref("UploadHistoryResponse"))
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions")
        }
      }
    },
    "/api/v1/upload/status/{uploadId}": {
      get: {
        tags: ["Upload"],
        summary: "Get upload session status",
        description: "Uploader and admin only.",
        operationId: "getUploadStatus",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "uploadId",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "Upload session",
            content: jsonContent(ref("UploadSession"))
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Upload session not found")
        }
      }
    },
    "/api/v1/videos": {
      get: {
        tags: ["Videos"],
        summary: "List videos",
        description: "Available to all authenticated users.",
        operationId: "listVideos",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "scope",
            in: "query",
            schema: {
              type: "string",
              enum: ["all", "mine"],
              default: "all"
            }
          },
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            }
          },
          {
            name: "random",
            in: "query",
            schema: {
              type: "boolean",
              default: false
            }
          }
        ],
        responses: {
          "200": {
            description: "Video list",
            content: jsonContent(ref("VideoListResponse"))
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions")
        }
      }
    },
    "/api/v1/videos/{id}": {
      get: {
        tags: ["Videos"],
        summary: "Get video detail",
        description: "Available to all authenticated users.",
        operationId: "getVideo",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "Video detail",
            content: jsonContent(ref("VideoDetail"))
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Resource not found")
        }
      },
      delete: {
        tags: ["Videos"],
        summary: "Delete a video",
        description: "Uploader can delete their own videos. Admin can delete any video.",
        operationId: "deleteVideo",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "204": {
            description: "Video deleted"
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Resource not found")
        }
      }
    },
    "/api/v1/videos/{id}/playback": {
      get: {
        tags: ["Videos"],
        summary: "Stream video playback",
        description: "Authenticated via bearer token or `token` query parameter. Supports HTTP range requests.",
        operationId: "streamVideoPlayback",
        security: [{ BearerAuth: [] }, { PlaybackToken: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          },
          {
            name: "token",
            in: "query",
            required: false,
            schema: {
              type: "string"
            },
            description: "JWT token alternative to the Authorization header."
          },
          {
            name: "Range",
            in: "header",
            required: false,
            schema: {
              type: "string"
            },
            description: "Byte range for partial content streaming."
          }
        ],
        responses: {
          "200": {
            description: "Video stream",
            content: binaryContent("video/mp4")
          },
          "206": {
            description: "Partial video stream",
            content: binaryContent("video/mp4")
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Resource not found")
        }
      }
    },
    "/api/v1/videos/{id}/preview": {
      get: {
        tags: ["Videos"],
        summary: "Get video preview image",
        description: "Authenticated via bearer token or `token` query parameter.",
        operationId: "getVideoPreview",
        security: [{ BearerAuth: [] }, { PlaybackToken: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          },
          {
            name: "token",
            in: "query",
            required: false,
            schema: {
              type: "string"
            },
            description: "JWT token alternative to the Authorization header."
          }
        ],
        responses: {
          "200": {
            description: "Preview image",
            content: binaryContent("image/jpeg")
          },
          "401": errorResponse("Authentication required"),
          "403": errorResponse("Insufficient permissions"),
          "404": errorResponse("Resource not found")
        }
      }
    }
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      },
      PlaybackToken: {
        type: "apiKey",
        in: "query",
        name: "token"
      }
    },
    schemas: {
      HealthResponse: {
        type: "object",
        required: ["status", "service"],
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "videofly-server" }
        }
      },
      MessageResponse: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" }
        }
      },
      ValidationIssue: {
        type: "object",
        required: ["code", "message", "path"],
        additionalProperties: true,
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          path: {
            type: "array",
            items: {
              oneOf: [{ type: "string" }, { type: "number" }]
            }
          }
        }
      },
      ErrorResponse: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
          issues: {
            type: "array",
            items: ref("ValidationIssue")
          }
        }
      },
      Role: {
        type: "string",
        enum: [...roleEnum]
      },
      VideoStatus: {
        type: "string",
        enum: [...videoStatusEnum]
      },
      UploadSessionStatus: {
        type: "string",
        enum: [...uploadSessionStatusEnum]
      },
      UserVideoCount: {
        type: "object",
        required: ["videos"],
        properties: {
          videos: {
            type: "integer",
            minimum: 0
          }
        }
      },
      User: {
        type: "object",
        required: ["id", "email", "role", "uploadQuotaBytes"],
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          role: ref("Role"),
          uploadQuotaBytes: {
            type: "string",
            description: "Serialized bigint in bytes.",
            example: "10737418240"
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          _count: ref("UserVideoCount")
        }
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 }
        }
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 }
        }
      },
      LoginResponse: {
        type: "object",
        required: ["token", "user"],
        properties: {
          token: { type: "string" },
          user: ref("User")
        }
      },
      PasswordResetRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" }
        }
      },
      ResetPasswordRequest: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string", minLength: 32 },
          password: { type: "string", minLength: 8 }
        }
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", minLength: 8 },
          newPassword: { type: "string", minLength: 8 }
        }
      },
      StorageUsage: {
        type: "object",
        required: [
          "totalSizeBytes",
          "reservedUploadBytes",
          "uploadQuotaBytes",
          "remainingQuotaBytes",
          "videoCount"
        ],
        properties: {
          totalSizeBytes: { type: "string", example: "1048576" },
          reservedUploadBytes: { type: "string", example: "0" },
          uploadQuotaBytes: { type: "string", example: "10737418240" },
          remainingQuotaBytes: { type: "string", example: "10736369664" },
          videoCount: { type: "integer", minimum: 0 }
        }
      },
      Pagination: {
        type: "object",
        required: ["page", "pageSize", "total", "totalPages"],
        properties: {
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          total: { type: "integer", minimum: 0 },
          totalPages: { type: "integer", minimum: 0 }
        }
      },
      UserListResponse: {
        type: "object",
        required: ["items", "pagination"],
        properties: {
          items: {
            type: "array",
            items: ref("User")
          },
          pagination: ref("Pagination")
        }
      },
      UpdateUserRoleRequest: {
        type: "object",
        required: ["role"],
        properties: {
          role: ref("Role")
        }
      },
      UpdateUserQuotaRequest: {
        type: "object",
        required: ["uploadQuotaBytes"],
        properties: {
          uploadQuotaBytes: {
            oneOf: [
              { type: "string", pattern: "^[0-9]+$" },
              { type: "integer", minimum: 0 }
            ],
            description: "Non-negative byte quota. The backend coerces numeric strings to bigint."
          }
        }
      },
      InitUploadRequest: {
        type: "object",
        required: ["title", "filename", "mimeType", "fileSizeBytes"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          filename: { type: "string", minLength: 1, maxLength: 255 },
          mimeType: {
            type: "string",
            enum: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"]
          },
          fileSizeBytes: {
            oneOf: [
              { type: "string", pattern: "^[0-9]+$" },
              { type: "integer", minimum: 1 }
            ]
          }
        }
      },
      UploadPartRequest: {
        type: "object",
        required: ["uploadId", "partNumber"],
        properties: {
          uploadId: { type: "string" },
          partNumber: { type: "integer", minimum: 1 }
        }
      },
      CompleteUploadRequest: {
        type: "object",
        required: ["uploadId"],
        properties: {
          uploadId: { type: "string" }
        }
      },
      CancelUploadRequest: {
        type: "object",
        required: ["uploadId"],
        properties: {
          uploadId: { type: "string" }
        }
      },
      UploadPartDetail: {
        type: "object",
        required: ["number", "checksum"],
        properties: {
          number: { type: "integer", minimum: 1 },
          checksum: { type: "string" }
        }
      },
      UploadSession: {
        type: "object",
        required: [
          "uploadId",
          "status",
          "partSizeBytes",
          "fileSizeBytes",
          "uploadedParts",
          "uploadedPartDetails",
          "totalParts"
        ],
        properties: {
          uploadId: { type: "string" },
          status: ref("UploadSessionStatus"),
          partSizeBytes: { type: "integer", minimum: 1 },
          fileSizeBytes: { type: "string", example: "10485760" },
          uploadedParts: {
            type: "array",
            items: { type: "integer", minimum: 1 }
          },
          uploadedPartDetails: {
            type: "array",
            items: ref("UploadPartDetail")
          },
          totalParts: { type: "integer", minimum: 1 },
          title: { type: "string" },
          filename: { type: "string" },
          mimeType: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      UploadPartStatusResponse: {
        type: "object",
        required: ["uploadId", "status"],
        properties: {
          uploadId: { type: "string" },
          status: {
            type: "string",
            enum: ["UPLOADING"]
          }
        }
      },
      UploadHistoryResponse: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: ref("UploadSession")
          }
        }
      },
      UploadedVideo: {
        type: "object",
        required: ["id", "title", "status", "sizeBytes", "ossKey"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: ref("VideoStatus"),
          sizeBytes: { type: "string", example: "10485760" },
          ossKey: { type: "string" }
        }
      },
      CanceledUpload: {
        type: "object",
        required: ["uploadId", "status"],
        properties: {
          uploadId: { type: "string" },
          status: ref("UploadSessionStatus")
        }
      },
      VideoUploader: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" }
        }
      },
      VideoListItem: {
        type: "object",
        required: ["id", "title", "status", "sizeBytes", "createdAt", "ossKey", "uploader", "playbackUrl"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: ref("VideoStatus"),
          sizeBytes: { type: "string", example: "10485760" },
          createdAt: { type: "string", format: "date-time" },
          ossKey: { type: "string" },
          uploader: ref("VideoUploader"),
          playbackUrl: { type: "string" }
        }
      },
      VideoListResponse: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: ref("VideoListItem")
          }
        }
      },
      VideoDetail: {
        allOf: [
          ref("VideoListItem"),
          {
            type: "object",
            required: ["updatedAt", "deletedAt", "uploaderId"],
            properties: {
              updatedAt: { type: "string", format: "date-time" },
              deletedAt: {
                type: "string",
                format: "date-time",
                nullable: true
              },
              uploaderId: { type: "string" }
            }
          }
        ]
      }
    }
  }
} as const satisfies JsonValue;

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatYamlScalar(value: null | boolean | number | string) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function toYaml(value: JsonValue, indentLevel = 0): string {
  const indent = "  ".repeat(indentLevel);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((item) => {
        if (isPlainObject(item)) {
          const entries = Object.entries(item);
          if (entries.length === 0) {
            return `${indent}- {}`;
          }

          const [firstKey, firstValue] = entries[0];
          const firstLine = `${indent}- ${formatYamlKey(firstKey)}:${formatYamlValue(firstValue, indentLevel + 1, true)}`;
          const remainingLines = entries
            .slice(1)
            .map(([key, nestedValue]) => {
              const nestedIndent = "  ".repeat(indentLevel + 1);
              return `${nestedIndent}${formatYamlKey(key)}:${formatYamlValue(nestedValue, indentLevel + 2, false)}`;
            })
            .join("\n");

          return remainingLines ? `${firstLine}\n${remainingLines}` : firstLine;
        }

        if (Array.isArray(item)) {
          return `${indent}-\n${toYaml(item, indentLevel + 1)}`;
        }

        return `${indent}- ${formatYamlScalar(item)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, nestedValue]) => `${indent}${formatYamlKey(key)}:${formatYamlValue(nestedValue, indentLevel + 1, false)}`)
      .join("\n");
  }

  return formatYamlScalar(value);
}

function formatYamlKey(key: string) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function formatYamlValue(value: JsonValue, indentLevel: number, inlineObjectItem: boolean) {
  if (isPlainObject(value) || Array.isArray(value)) {
    const rendered = toYaml(value, indentLevel);
    const prefix = inlineObjectItem ? "\n" : "\n";
    return `${prefix}${rendered}`;
  }

  return ` ${formatYamlScalar(value)}`;
}

export function getOpenApiYaml() {
  return `${toYaml(openApiDocument)}\n`;
}
