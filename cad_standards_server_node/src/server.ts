import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { disciplineSchema, recommendStandard } from "./catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");
const TEMPLATE_URI = "ui://cad-standards/cad-standards-v1.html";
const PUBLIC_ORIGIN = "https://mcp.dwginspect.com";

function readWidgetHtml(): string {
  const widgetPath = path.join(ASSETS_DIR, "cad-standards.html");
  if (!fs.existsSync(widgetPath)) {
    throw new Error(`Widget asset missing at ${widgetPath}. Run pnpm run build -- --target cad-standards.`);
  }
  return fs.readFileSync(widgetPath, "utf8");
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "cad-standards", version: "1.0.0" },
    {
      instructions: [
        "Use recommend_cad_standards when a user asks for a Tanner Press reference recommendation for a CAD layer name, color, linetype, or lineweight.",
        "Call it only after the discipline and drawing element are known; ask the user to clarify either value when missing.",
        "Present catalog matches as reference recommendations, not as project-specific approval or a universal industry requirement.",
        "A missing match means the catalog has no recommendation for that discipline and element.",
        "The tool is read-only and does not modify drawings or files.",
      ].join(" "),
    },
  );

  registerAppTool(
    server,
    "recommend_cad_standards",
    {
      title: "Recommend CAD Layer",
      description: "Returns Tanner Press reference settings for a CAD layer when given a discipline and drawing element.",
      inputSchema: {
        discipline: disciplineSchema,
        element: z.string().min(1).max(120).describe("Drawing element such as wall, door, lighting, or duct"),
      },
      outputSchema: {
        recommendation: z.string(),
        discipline: disciplineSchema,
        element: z.string(),
        layer: z.string().nullable(),
        color: z.number().int().nullable(),
        linetype: z.string().nullable(),
        lineweight_mm: z.number().nullable(),
        standard_found: z.boolean(),
        source: z.literal("Tanner Press CAD Reference Catalog v1"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      // ext-apps 1.0.1 passes this through to registerTool, but its config type
      // predates the current MCP auth metadata field.
      // @ts-expect-error -- supported by the underlying MCP SDK at runtime.
      securitySchemes: [{ type: "noauth" }],
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        ui: { resourceUri: TEMPLATE_URI },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Checking CAD references…",
        "openai/toolInvocation/invoked": "CAD reference checked",
      },
    },
    async ({ discipline, element }) => {
      const answer = recommendStandard(discipline, element);
      return {
        content: [{ type: "text" as const, text: answer.recommendation }],
        structuredContent: answer,
      };
    },
  );

  registerAppResource(
    server,
    "CAD Standards Result",
    TEMPLATE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Tanner Press CAD reference properties in a compact result card",
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { connectDomains: [], resourceDomains: [] },
        },
        "openai/widgetDescription": "Shows Tanner Press reference settings for a CAD layer, color, linetype, and lineweight.",
        "openai/widgetPrefersBorder": true,
      },
    },
    async () => ({
      contents: [{ uri: TEMPLATE_URI, mimeType: RESOURCE_MIME_TYPE, text: readWidgetHtml() }],
    }),
  );

  return server;
}

const port = Number.parseInt(process.env.PORT ?? "8010", 10);
export const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CAD Standards MCP</title></head>
<body><main><h1>CAD Standards MCP</h1><p>Read-only Tanner Press CAD reference recommendations for ChatGPT and other MCP clients.</p><ul><li><a href="/health">Health</a></li><li><a href="/llms.txt">LLM discovery</a></li><li><a href="/sitemap.md">Documentation map</a></li></ul></main></body>
</html>`);
});
app.get("/health", (_req, res) => res.json({ status: "ok", service: "cad-standards" }));
app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# CAD Standards MCP

> Read-only CAD layer reference recommendations backed by the Tanner Press CAD Reference Catalog.

## Endpoints

- [MCP endpoint](${PUBLIC_ORIGIN}/mcp): Streamable HTTP MCP endpoint for tool discovery and calls.
- [Health check](${PUBLIC_ORIGIN}/health): Service availability status.
- [Full agent context](${PUBLIC_ORIGIN}/llms-full.txt): Complete tool and usage guidance.
- [Documentation map](${PUBLIC_ORIGIN}/sitemap.md): Human-readable site map.
`);
});
app.get("/llms-full.txt", (_req, res) => {
  res.type("text/plain").send(`# CAD Standards MCP

> A read-only MCP app that recommends Tanner Press CAD reference layer properties.

## Tool

### recommend_cad_standards

Use this tool when a user asks for a CAD layer name, color, linetype, or lineweight. Provide a supported discipline—architectural, civil, electrical, or mechanical—and a drawing element. The result includes a recommendation, normalized element, layer, color, linetype, lineweight in millimeters, match status, and source. A missing match returns null standard values and recommends CAD-manager review. The tool does not modify drawings or files.

## Connection

- MCP URL: ${PUBLIC_ORIGIN}/mcp
- Transport: Streamable HTTP
- Authentication: None
- Safety: Read-only, non-destructive, and closed-world
`);
});
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
`);
});
app.get("/sitemap.xml", (_req, res) => {
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${PUBLIC_ORIGIN}/</loc><lastmod>2026-07-17</lastmod></url>
  <url><loc>${PUBLIC_ORIGIN}/llms.txt</loc><lastmod>2026-07-17</lastmod></url>
  <url><loc>${PUBLIC_ORIGIN}/llms-full.txt</loc><lastmod>2026-07-17</lastmod></url>
  <url><loc>${PUBLIC_ORIGIN}/sitemap.md</loc><lastmod>2026-07-17</lastmod></url>
  <url><loc>${PUBLIC_ORIGIN}/AGENTS.md</loc><lastmod>2026-07-17</lastmod></url>
</urlset>`);
});
app.get("/sitemap.md", (_req, res) => {
  res.type("text/markdown").send(`# CAD Standards MCP Site Map

## Service

- [Service overview](${PUBLIC_ORIGIN}/)
- [MCP endpoint](${PUBLIC_ORIGIN}/mcp)
- [Health check](${PUBLIC_ORIGIN}/health)

## Agent Guidance

- [LLM discovery](${PUBLIC_ORIGIN}/llms.txt)
- [Full LLM context](${PUBLIC_ORIGIN}/llms-full.txt)
- [Agent instructions](${PUBLIC_ORIGIN}/AGENTS.md)
`);
});
app.get("/AGENTS.md", (_req, res) => {
  res.type("text/markdown").send(`# CAD Standards MCP Agent Guide

## Overview

This service provides read-only Tanner Press CAD reference recommendations through MCP.

## MCP Endpoint

Connect to \`${PUBLIC_ORIGIN}/mcp\` using Streamable HTTP. No authentication is required.

## Tools

Use \`recommend_cad_standards\` only for CAD layer name, color, linetype, or lineweight questions. Supply both the discipline and drawing element. Ask for clarification when either is missing.

## Safety and Boundaries

The tool does not edit drawings or files. Treat catalog matches as reference recommendations, not universal requirements. Never invent layer properties when \`standard_found\` is false.
`);
});

app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  app.listen(port, () => {
    console.log(`CAD Standards MCP server listening on http://localhost:${port}/mcp`);
  });
}
