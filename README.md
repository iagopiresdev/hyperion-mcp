# hyperion-mcp

A fast, **Model Context Protocol (MCP) conformant** server framework optimized for **performance** and developer experience. Built with **Bun and Hono**.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-black)](https://bun.sh/)
[![Built with Hono](https://img.shields.io/badge/Built%20with-Hono-blue)](https://hono.dev/)

## Overview

hyperion-mcp implements the Model Context Protocol (MCP), an open standard enabling AI models to interact with external tools and systems. This framework prioritizes:

- **MCP Conformance**: Striving for strict adherence to the official MCP specification.
- **Performance**: Leveraging Bun and Hono for maximum speed and low latency.
- **Developer Experience**: Providing clean, well-typed TypeScript APIs.
- **Security**: Implementing robust authentication and authorization (targeting MCP's OAuth 2.1 recommendation).

## Core MCP Features Implemented

- ⚙️ **JSON-RPC 2.0 Endpoint**: Standard `/invoke` endpoint for tool calls.
- 🧩 **Tool Definitions**: Supports `name`, `description`, `parameters` (JSON Schema), and `metadata`.
- 🔄 **Streaming**: Handles streaming responses via JSON Lines containing JSON-RPC objects.
- ⚠️ **MCP Error Handling**: Distinguishes protocol errors (JSON-RPC `error`) and tool execution errors (`result.metadata.isError`).
- 📡 **Server Capabilities**: Declares supported features (e.g., `tools`) via the `/` endpoint.
- 🔐 **Authentication (Custom)**: Supports API Key + Client ID (via `Authorization: Bearer` + `X-Client-ID`) with bcrypt hashing and a database backend. _(Note: This is a functional interim solution; the goal is full MCP OAuth 2.1 conformance)._
- 📊 **Observability**: Basic metrics (`/metrics`) and structured logging.

## Available Tools (Examples)

- **Task Management**: `create_task`, `list_tasks`, `complete_task` (requires DB setup).
- **LLM Query**: `openai_query`, `anthropic_query` (requires API keys).
- **Connectors**: `fetch_webpage`, `filesystem_*` (sandboxed), `pinecone_search` (requires API keys).
- **Demo**: `slow_task` (demonstrates streaming).

## Why JavaScript/TypeScript?

While languages like Rust or Go are often chosen for raw speed, hyperion-mcp uses TypeScript with the high-performance Bun runtime and the optimized Hono framework. This strategic choice aims to deliver:

- **Near-Native Speed**: Bun's JavaScriptCore engine and efficient design minimize overhead.
- **Optimized Framework**: Hono is one of the fastest web frameworks available for JS runtimes.
- **Developer Velocity**: Faster iteration and development cycles compared to lower-level languages.
- **Ecosystem Leverage**: Access to the vast npm ecosystem for tooling and libraries.
- **Edge Compatibility**: Excellent suitability for low-latency edge deployments.

We believe this combination offers a compelling balance, providing elite performance without sacrificing developer productivity or ecosystem access. Performance is a key goal, and we plan to validate this with cross-implementation benchmarks.

## Getting Started

1.  **Prerequisites**: Bun (`v1.1+`), Node.js (optional), Database (e.g., Supabase), API keys for desired tools.
2.  **Install**: `git clone <repo> && cd hyperion-mcp && bun install`
3.  **Configure**: Copy `.env.example` to `.env` and add your DB credentials/API keys.
4.  **Database**: Set up required tables (e.g., `api_keys`, `tasks`).
5.  **Run**: `bun run dev` (Server at `http://localhost:3333`, docs at `/docs`).

## Target: Full MCP Conformance & Performance Leadership

The primary goals are full alignment with the latest MCP specification **and** demonstrating top-tier performance among conformant servers. Key next steps include:

- Implementing the recommended **OAuth 2.1 Authorization flow**.
- Developing a **Protocol Conformance Test Suite**.
- Implementing **MCP Resources**.
- Providing a spec-compliant **Client SDK**.
- Establishing **formal performance benchmarks**.

## License

MIT
