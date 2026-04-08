import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getOpenApiYaml, openApiDocument } from "../src/openapi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, "../openapi");

mkdirSync(outputDir, { recursive: true });

writeFileSync(path.join(outputDir, "openapi.json"), `${JSON.stringify(openApiDocument, null, 2)}\n`);
writeFileSync(path.join(outputDir, "openapi.yaml"), getOpenApiYaml());

console.log(`OpenAPI docs written to ${outputDir}`);
