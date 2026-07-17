import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { app, createMcpServer } from "./server.js";

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const server = createMcpServer();
  const client = new Client({ name: "cad-standards-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("advertises the complete structured output schema", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === "recommend_cad_standards");

    assert.ok(tool, "recommend_cad_standards should be advertised");
    assert.equal(tool.outputSchema?.type, "object");
    assert.deepEqual(tool.outputSchema?.required, [
      "recommendation",
      "discipline",
      "element",
      "layer",
      "color",
      "linetype",
      "lineweight_mm",
      "standard_found",
      "source",
    ]);
  });
});

test("returns a complete catalog match", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "recommend_cad_standards",
      arguments: { discipline: "architectural", element: "wall" },
    });

    assert.deepEqual(result.structuredContent, {
      recommendation:
        "Recommended reference settings for architectural wall: layer A-WALL, color 1, Continuous linetype, and 0.35 mm lineweight.",
      discipline: "architectural",
      element: "wall",
      layer: "A-WALL",
      color: 1,
      linetype: "Continuous",
      lineweight_mm: 0.35,
      standard_found: true,
      source: "Tanner Press CAD Reference Catalog v1",
    });
  });
});

test("normalizes element names before lookup", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "recommend_cad_standards",
      arguments: { discipline: "civil", element: "  PROPERTY-LINE  " },
    });
    const output = result.structuredContent as Record<string, unknown>;

    assert.equal(output.element, "property line");
    assert.equal(output.layer, "C-PROP");
    assert.equal(output.standard_found, true);
  });
});

test("returns null properties instead of inventing a missing standard", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "recommend_cad_standards",
      arguments: { discipline: "mechanical", element: "piping" },
    });

    assert.deepEqual(result.structuredContent, {
      recommendation:
        "No Tanner Press reference recommendation is available for mechanical piping. Review the project requirements or consult the project CAD manager.",
      discipline: "mechanical",
      element: "piping",
      layer: null,
      color: null,
      linetype: null,
      lineweight_mm: null,
      standard_found: false,
      source: "Tanner Press CAD Reference Catalog v1",
    });
  });
});

test("serves agent discovery files from the public origin", async () => {
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address() as AddressInfo;

  try {
    const [root, challenge, llms, robots, sitemap, agents] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/`),
      fetch(`http://127.0.0.1:${port}/.well-known/openai-apps-challenge`),
      fetch(`http://127.0.0.1:${port}/llms.txt`),
      fetch(`http://127.0.0.1:${port}/robots.txt`),
      fetch(`http://127.0.0.1:${port}/sitemap.xml`),
      fetch(`http://127.0.0.1:${port}/AGENTS.md`),
    ]);

    assert.equal(root.status, 200);
    assert.match(await root.text(), /CAD Standards MCP/);
    assert.match(challenge.headers.get("content-type") ?? "", /^text\/plain/);
    assert.equal(
      await challenge.text(),
      "McVu5vfu78PI6rZgLh56V0QuZgJ6nZ_mF6YDhTR6ehk",
    );
    assert.match(llms.headers.get("content-type") ?? "", /^text\/plain/);
    assert.match(await llms.text(), /https:\/\/mcp\.dwginspect\.com\/mcp/);
    assert.match(await robots.text(), /Allow: \//);
    assert.match(await sitemap.text(), /<lastmod>2026-07-17<\/lastmod>/);
    assert.match(await agents.text(), /recommend_cad_standards/);
  } finally {
    listener.close();
    await once(listener, "close");
  }
});
