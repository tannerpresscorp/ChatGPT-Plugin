# CAD Standards Assistant

## Value Proposition

CAD Standards Assistant helps architects and engineers quickly retrieve approved CAD layer properties, replacing manual searches through standards documents.

**Core action:** Recommend the approved layer name, color, linetype, and lineweight for a specified discipline and drawing element.

## Why an LLM?

**Conversational advantage:** Users can ask naturally, such as “What layer should mechanical ductwork use?”

**LLM contribution:** The model interprets drawing terminology and optional project context, consults the authoritative catalog, and presents the result clearly.

**What the LLM lacks:** The authoritative CAD standards catalog, which the MCP tool supplies.

**Boundary:** The app recommends standards but does not edit drawings or invent missing standards.

## UI Overview

**First view:** The user asks for a standard by discipline and drawing element.

**Main interaction:** The app looks up the authoritative catalog and displays the layer, color, linetype, and lineweight in a compact result card.

**No-match path:** Standard values remain empty and the app recommends review by the CAD manager.

**End state:** The user has an approved, source-labeled recommendation ready to apply manually.

## Product Context

- **Product:** Standalone ChatGPT app with an MCP server and result widget.
- **Data:** Small in-memory authoritative catalog, intended to be replaced later by the organization’s standards database or service.
- **Lookup:** The MCP server normalizes the requested element and performs a deterministic catalog lookup.
- **Authentication:** No app-user authentication is required.
- **Supported disciplines:** Architectural, civil, electrical, and mechanical.
- **Constraints:** Read-only; no drawing-file access; no invented standards when the catalog has no match.

## Current Improvement Scope

- Declare an explicit MCP `outputSchema` for `recommend_cad_standards` that matches its structured result.
- Add focused automated tests for catalog matches, normalized element names, and missing-standard behavior.
- Preserve the existing public tool inputs, read-only behavior, and widget result shape.

## UX Flow

Recommend a CAD layer standard:

1. Receive a discipline and drawing element conversationally.
2. Look up the normalized element in the reference catalog.
3. Return the complete recommendation to the model and result card.
4. If no record matches, return null standard properties and recommend CAD-manager review.

## Tool and View Architecture

**View-backed tool: `recommend_cad_standards`**

- **Input:** `{ discipline, element }`
- **Output:** `{ recommendation, discipline, element, layer, color, linetype, lineweight_mm, standard_found, source }`
- **View:** Compact CAD reference result card.
- **Behavior:** Read-only, deterministic catalog lookup with normalized element names.
- **Output contract:** Every structured result must satisfy the declared MCP `outputSchema`, including null standard properties for a missing catalog match.

## Verification

- Confirm the advertised MCP descriptor includes the complete output schema.
- Test an exact catalog match.
- Test normalized element input.
- Test missing-catalog behavior and verify that no standard values are invented.

## Production Endpoint

- **Canonical origin:** `https://mcp.dwginspect.com`
- **MCP endpoint:** `https://mcp.dwginspect.com/mcp`
- **Hosting:** Google Cloud Run with a managed TLS certificate.
- **DNS:** The `mcp` CNAME is managed through GoDaddy and targets `ghs.googlehosted.com`.
- **Discovery:** The origin serves a landing page, `llms.txt`, `llms-full.txt`, `robots.txt`, XML and Markdown sitemaps, and `AGENTS.md` without changing the MCP tool contract.
- **OpenAI verification:** `/.well-known/openai-apps-challenge` serves the assigned verification token as plain text.
