# Repository Guidelines

## Project Structure & Module Organization
This is a `pnpm` workspace with two apps:

- `client/`: Vue 3 + Vite frontend. Main code lives in `client/src/pages`, `client/src/stores`, and `client/src/workers`.
- `server/`: Express + Prisma backend. Runtime code is in `server/src`, split into `routes`, `middleware`, and `lib`.
- `server/prisma/`: Prisma schema, migrations, and seed logic.
- `server/test/`: Vitest integration tests.
- `deploy/` and `scripts/`: Nginx config and deployment automation.

Do not edit generated output in `client/dist` or `server/dist` unless the task is explicitly about build artifacts.

## Build, Test, and Development Commands
- `pnpm dev`: run client and server in parallel for local development.
- `pnpm build`: build both workspace packages.
- `pnpm lint`: run type-based checks across the repo.
- `pnpm --filter @videofly/client build`: build the frontend static bundle.
- `pnpm --filter @videofly/server dev`: run the API with `tsx watch`.
- `pnpm --filter @videofly/server test`: run server integration tests.
- `pnpm --filter @videofly/server prisma:migrate`: create and apply a local Prisma migration.
- `bash scripts/deploy.sh`: build and deploy to the configured server.

## Coding Style & Naming Conventions
Use TypeScript throughout. Follow existing style:

- 2-space indentation in Vue, TS, JSON, and YAML.
- `PascalCase` for Vue page components such as `DashboardUploadPage.vue`.
- `camelCase` for variables, functions, and composables.
- Keep route files focused on one resource, for example `server/src/routes/upload.ts`.
- Prefer explicit types at API boundaries and Zod validation for request parsing.

Formatting is enforced mainly through TypeScript checks (`vue-tsc`, `tsc`), not a separate Prettier/ESLint setup.

## Testing Guidelines
Backend tests use Vitest and Supertest under `server/test`. Name tests `*.test.ts`. Prefer integration coverage for auth, upload, and API behavior changes. Run:

- `pnpm --filter @videofly/server test`

For frontend changes, at minimum run `pnpm --filter @videofly/client build` before submitting.

## Commit & Pull Request Guidelines
Recent history uses short imperative subjects such as `Improve upload` and `Add deploy script`. Keep commits concise, specific, and action-oriented.

PRs should include:

- a short summary of behavior changes
- linked issue or task context
- test/build results
- screenshots or recordings for UI changes

## Security & Configuration Tips
Keep secrets in local `.env` files only. Do not commit credentials, tokens, or production host overrides. Validate deploy-related changes against `deploy/nginx/*.conf`, `docker-compose.yml`, and OSS-related server config together.
