# CAD Standards Assistant

A read-only ChatGPT app that recommends CAD layer properties from the Tanner Press reference catalog. The MCP server performs deterministic catalog lookups with a strict structured output contract and renders results in a compact widget.

## Production

- MCP endpoint: `https://mcp.dwginspect.com/mcp`
- Health check: `https://mcp.dwginspect.com/health`
- Agent discovery: `https://mcp.dwginspect.com/llms.txt`

## Run locally

From the repository root:

```powershell
pnpm install
pnpm run build -- --target cad-standards
pnpm --filter cad-standards-mcp-node start
```

The MCP endpoint is `http://localhost:8010/mcp`; health is available at `http://localhost:8010/health`.

### Docker Desktop

From the repository root:

```powershell
docker compose up --build -d
docker compose ps
```

For local ChatGPT Developer Mode testing, expose port 8010 through an HTTPS tunnel and add the resulting URL with `/mcp` as a new app. Refresh the app after changing tool metadata or rebuilding the widget.

## Configuration

Update `src/catalogs/tanner-press-cad-reference-v1.json` to maintain the reference catalog. Catalog data is validated at server startup.
