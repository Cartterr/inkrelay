# InkRelay

InkRelay is a private RSS-to-Kindle enrichment system. It curates a fixed set of trusted technical feeds, produces high-contrast monochrome editorial covers, and exposes protected proxy feeds and readable article pages for KTool.

## Product guarantees

- Exactly 58 approved sources are registered.
- Exactly 10 distinct-source articles are selected for each published weekly edition.
- Each edition is available as a self-contained EPUB with a declared 1200×1600 Kindle cover.
- Extracted pages are sanitized, attributed, non-indexed, and retained for 90 days.
- Secrets belong in Railway or local environment variables, never in Git.
- The service remains useful without an AI provider through deterministic scoring and cover fallbacks.

## Repository layout

- `apps/web` — Next.js dashboard, feeds, article pages, assets, and health routes.
- `apps/worker` — ingestion, extraction, evaluation, publishing, and scheduled jobs.
- `packages/core` — source registry and domain behavior.
- `packages/db` — PostgreSQL schema, migrations, repositories, and durable jobs.
- `packages/rendering` — monochrome cover generation, standards-compliant EPUBs, and asset storage.
- `docs` — architecture, operations, security, and implementation plans.

## Local development

Requirements: Node.js 24 LTS and pnpm 10.

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm test
pnpm dev
```

See [Architecture](docs/architecture.md), [Security](docs/security.md), and [Operations](docs/operations.md).

The executable source inventory is committed in
[`packages/core/src/sources.ts`](packages/core/src/sources.ts) and guarded by an exact-count,
unique-ID, unique-slug test. Julia Evans, GDC, Art of VFX, and pending newsletters are intentionally
excluded.

## License

MIT
