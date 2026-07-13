import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";

type Discipline = "architectural" | "civil" | "electrical" | "mechanical";

interface StandardRecord {
  layer: string;
  color: number;
  linetype: string;
  lineweight_mm: number;
}

interface CadAnswer {
  [key: string]: unknown;
  recommendation: string;
  discipline: Discipline;
  element: string;
  layer: string | null;
  color: number | null;
  linetype: string | null;
  lineweight_mm: number | null;
  standard_found: boolean;
  source: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");
const TEMPLATE_URI = "ui://cad-standards/cad-standards-v1.html";

dotenv.config({ path: path.resolve(ROOT_DIR, ".env.local") });

const standards: Record<string, StandardRecord> = {
  "architectural:wall": { layer: "A-WALL", color: 1, linetype: "Continuous", lineweight_mm: 0.35 },
  "architectural:door": { layer: "A-DOOR", color: 3, linetype: "Continuous", lineweight_mm: 0.25 },
  "architectural:window": { layer: "A-GLAZ", color: 4, linetype: "Continuous", lineweight_mm: 0.25 },
  "civil:contour": { layer: "C-TOPO-MAJR", color: 30, linetype: "Continuous", lineweight_mm: 0.25 },
  "civil:property line": { layer: "C-PROP", color: 6, linetype: "Phantom", lineweight_mm: 0.35 },
  "electrical:lighting": { layer: "E-LITE-FIXT", color: 2, linetype: "Continuous", lineweight_mm: 0.25 },
  "electrical:power": { layer: "E-POWR", color: 1, linetype: "Continuous", lineweight_mm: 0.25 },
  "mechanical:duct": { layer: "M-DUCT", color: 5, linetype: "Continuous", lineweight_mm: 0.35 },
  "mechanical:equipment": { layer: "M-EQPM", color: 3, linetype: "Continuous", lineweight_mm: 0.35 },
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

function lookupLayerStandard(discipline: Discipline, element: string) {
  const match = standards[`${discipline}:${normalize(element)}`];
  return match
    ? { found: true, ...match, source: "Internal CAD Standards v1" }
    : { found: false, source: "Internal CAD Standards v1" };
}

const outputFormat = {
  type: "json_schema" as const,
  name: "cad_standard_answer",
  strict: true,
  schema: {
    type: "object",
    properties: {
      recommendation: { type: "string" },
      discipline: { type: "string", enum: ["architectural", "civil", "electrical", "mechanical"] },
      element: { type: "string" },
      layer: { type: ["string", "null"] },
      color: { type: ["integer", "null"] },
      linetype: { type: ["string", "null"] },
      lineweight_mm: { type: ["number", "null"] },
      standard_found: { type: "boolean" },
      source: { type: "string" },
    },
    required: [
      "recommendation", "discipline", "element", "layer", "color", "linetype",
      "lineweight_mm", "standard_found", "source",
    ],
    additionalProperties: false,
  },
};

async function recommendStandard(
  discipline: Discipline,
  element: string,
  notes?: string,
): Promise<CadAnswer> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools = [
    {
      type: "function" as const,
      name: "lookup_layer_standard",
      description: "Look up the approved CAD layer, color, linetype, and lineweight.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          discipline: { type: "string", enum: ["architectural", "civil", "electrical", "mechanical"] },
          element: { type: "string" },
        },
        required: ["discipline", "element"],
        additionalProperties: false,
      },
    },
  ];

  let response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5.6",
    reasoning: { effort: "low" },
    instructions: [
      "You are a CAD standards assistant.",
      "Always consult lookup_layer_standard before answering.",
      "Never invent an official layer designation.",
      "If no record is found, return null standard values and recommend review by the CAD manager.",
    ].join(" "),
    input: `Discipline: ${discipline}\nElement: ${element}${notes ? `\nProject notes: ${notes}` : ""}`,
    tools,
    text: { format: outputFormat },
  });

  for (let turn = 0; turn < 4; turn += 1) {
    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      return JSON.parse(response.output_text) as CadAnswer;
    }

    const toolOutputs = calls.map((call) => {
      if (call.name !== "lookup_layer_standard") {
        throw new Error(`Unknown tool requested: ${call.name}`);
      }
      const args = JSON.parse(call.arguments) as { discipline: Discipline; element: string };
      return {
        type: "function_call_output" as const,
        call_id: call.call_id,
        output: JSON.stringify(lookupLayerStandard(args.discipline, args.element)),
      };
    });

    response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      reasoning: { effort: "low" },
      previous_response_id: response.id,
      input: toolOutputs,
      tools,
      text: { format: outputFormat },
    });
  }

  throw new Error("The standards lookup did not complete within the allowed tool turns.");
}

function readWidgetHtml(): string {
  const widgetPath = path.join(ASSETS_DIR, "cad-standards.html");
  if (!fs.existsSync(widgetPath)) {
    throw new Error(`Widget asset missing at ${widgetPath}. Run pnpm run build -- --target cad-standards.`);
  }
  return fs.readFileSync(widgetPath, "utf8");
}

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "cad-standards", version: "1.0.0" },
    { instructions: "Use recommend_cad_standards for CAD layer, color, linetype, or lineweight questions." },
  );

  registerAppTool(
    server,
    "recommend_cad_standards",
    {
      title: "Recommend CAD Layer",
      description: "Use this when a user needs the approved CAD layer properties for a drawing element.",
      inputSchema: {
        discipline: z.enum(["architectural", "civil", "electrical", "mechanical"]),
        element: z.string().min(1).max(120).describe("Drawing element such as wall, door, lighting, or duct"),
        notes: z.string().max(500).optional().describe("Optional project context"),
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
        "openai/toolInvocation/invoking": "Checking CAD standards…",
        "openai/toolInvocation/invoked": "CAD standard checked",
      },
    },
    async ({ discipline, element, notes }) => {
      try {
        const answer = await recommendStandard(discipline, element, notes);
        return {
          content: [{ type: "text" as const, text: answer.recommendation }],
          structuredContent: answer,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          isError: true,
          content: [{ type: "text" as const, text: `CAD standards lookup failed: ${message}` }],
        };
      }
    },
  );

  registerAppResource(
    server,
    "CAD Standards Result",
    TEMPLATE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Approved CAD layer properties in a compact result card",
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { connectDomains: [], resourceDomains: [] },
        },
        "openai/widgetDescription": "Shows the approved CAD layer, color, linetype, and lineweight.",
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
const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "cad-standards" }));

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

app.listen(port, () => {
  console.log(`CAD Standards MCP server listening on http://localhost:${port}/mcp`);
});
