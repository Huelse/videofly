import { Router } from "express";

import { getOpenApiYaml, openApiDocument } from "../openapi.js";

export const openApiRouter = Router();

openApiRouter.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

openApiRouter.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").send(getOpenApiYaml());
});
