# CAD Standards Assistant

A read-only ChatGPT app that recommends approved CAD layer properties from a small authoritative catalog. The server uses the OpenAI Responses API with function calling and strict structured output, then renders the result in a React widget.

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

The API key is injected at runtime from `.env.local`; it is excluded from the image build context.

For ChatGPT Developer Mode, expose port 8010 through an HTTPS tunnel and add the resulting URL with `/mcp` as a new app. Refresh the app after changing tool metadata or rebuilding the widget.

## Configuration

The server reads `OPENAI_API_KEY` from the repository root `.env.local`. Optionally set `OPENAI_MODEL`; the default is `gpt-5.6`.

Replace the in-memory `standards` catalog in `src/server.ts` with your authoritative database or standards service before production use.
