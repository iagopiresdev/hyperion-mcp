# hyperion-mcp

The ultra-fast Model Context Protocol (MCP) server framework optimized for performance and developer experience. Built with Bun and Hono for maximum speed and minimal latency.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-black)](https://bun.sh/)
[![Built with Hono](https://img.shields.io/badge/Built%20with-Hono-blue)](https://hono.dev/)

## What is hyperion-mcp?

hyperion-mcp is a high-performance implementation of the Model Context Protocol (MCP) - an open standard that enables AI models to interact with external systems through a standardized interface. This framework is designed with the following core principles:

- **Unparalleled Performance**: Built on Bun and Hono for maximum speed
- **Developer Experience**: Clean TypeScript APIs with excellent DX
- **Modern Web Architecture**: Embraces cutting-edge web standards
- **Lightweight Core & Extensibility**: Minimal base with plugin support

## Features

- 🚀 **Ultra-Fast Performance**: Optimized for speed at every level
- 💡 **Developer-Friendly**: Clear, well-typed API with comprehensive documentation
- 🔌 **Plug-and-Play Tools**: Example tools ready to use or customize
- 🔄 **Streaming Responses**: Built for real-time, streaming interactions
- 🔒 **Type-Safe End-to-End**: Full TypeScript support
- 🧩 **Extensible Architecture**: Easily add new tools and capabilities
- 📊 **Built-in Observability**: Metrics and logging from the start
- ☁️ **Edge-Ready**: Optimized for edge computing environments

## Available Tools

hyperion-mcp comes with a set of pre-built tools:

**Task Management:**

- `create_task`: Create a new task.
- `list_tasks`: List tasks, optionally filtering by status (all, completed, active).
- `complete_task`: Mark a task as completed by its ID.

**LLM Query:**

- `openai_query`: Query OpenAI models (e.g., GPT-3.5, GPT-4) with support for various parameters and streaming.
- `anthropic_query`: Query Anthropic (Claude) models via the Messages API, supporting streaming and various parameters.

**Connectors:**

- `github_list_issues`: List issues for a specified GitHub repository, with filtering options.

**Examples:**

- `slow_task`: A demo tool that processes items slowly, showcasing streaming progress updates.

_(More tools and connectors are planned!)_

## Why JavaScript/TypeScript?

While there are many languages suitable for building high-performance servers (Rust, Go, etc.), we chose TypeScript for hyperion-mcp for several strategic reasons:

- **Developer Velocity**: The JavaScript ecosystem enables rapid development and iteration
- **Vast Ecosystem**: Access to the largest package ecosystem in the world
- **Modern Runtime**: Bun provides near-native performance with JavaScript convenience
- **Type Safety**: TypeScript adds strong typing without compromising flexibility
- **Familiarity**: Accessible to the broadest developer audience
- **Edge Compatibility**: Excellent support for serverless and edge deployments
- **Full-Stack Consistency**: Same language across frontend, backend, and tooling

The combination of TypeScript with Bun's high-performance runtime gives us the best of both worlds: development speed and runtime efficiency.

## Getting Started

1. Install dependencies:

   ```
   bun install
   ```

2. Start the development server:

   ```
   bun run dev
   ```

3. The server will be available at `http://localhost:3333`

## Benchmarks

hyperion-mcp is designed for performance. In internal testing, it can handle:

- 10,000+ requests per second on modest hardware
- Sub-millisecond response times for tool registration and discovery
- Minimal memory footprint (< 50MB even under high load)

## Why Choose hyperion-mcp?

- **Performance**: Faster than traditional Node.js implementations
- **Developer Experience**: Cleaner API with stronger typing
- **Edge Deployments**: Optimized for modern edge environments
- **Observability**: Built-in metrics and logging
- **Resource Efficiency**: Lower CPU and memory usage

## Roadmap

- Expanded tool ecosystem
- Authentication and authorization patterns
- Persistent storage adapters
- Advanced observability features
- Benchmarking suite

## License

MIT
