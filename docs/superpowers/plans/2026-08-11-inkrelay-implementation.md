# InkRelay Implementation Plan

> **For agentic workers:** Execute task-by-task with test-driven development and verification checkpoints.

**Goal:** Build and deploy a secure, professional 58-source RSS-to-Kindle enrichment system.

**Architecture:** A pnpm TypeScript monorepo with Next.js web, a persistent worker, a cron scheduler, PostgreSQL durable jobs, and private S3-compatible cover storage on Railway.

**Tech Stack:** Node.js 24, TypeScript, Next.js, React, Drizzle ORM, PostgreSQL, pg-boss, Auth.js, Mozilla Readability, Sharp, Vitest, Playwright, Biome, Railway.

## Global constraints

- Exactly 58 approved sources; no automatic source expansion.
- Exactly 10 distinct-source selections in a published weekly edition.
- No credential may enter source control, logs, documentation, or command arguments.
- KTool subscription removal requires explicit action-time authorization.
- Every behavioral implementation begins with a failing test.

## Tasks

1. Establish repository policy, monorepo tooling, CI, documentation, and branch protections.
2. Define domain contracts, the 58-source registry, validation, and database schema.
3. Implement safe feed ingestion, autodiscovery, Hacker News ingestion, and deduplication.
4. Implement safe article extraction, sanitization, diagnostics, and image discovery.
5. Implement deterministic and provider-assisted evaluation plus exact-ten weekly selection.
6. Implement monochrome cover rendering, private asset storage, and fallbacks.
7. Implement protected source/weekly feeds, article pages, retention, and access rotation.
8. Implement the GitHub-restricted dashboard, worker, scheduler, health, and audit views.
9. Run complete verification, publish a draft pull request, and deploy staging on Railway.
10. Validate KTool Quick Send and prepare the explicit, reversible subscription cutover.
