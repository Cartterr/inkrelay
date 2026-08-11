# InkRelay

InkRelay is a private reading pipeline for Kindle. It curates a fixed set of trusted technical feeds, produces high-contrast monochrome editorial covers, and publishes protected feeds, readable article pages, and a self-contained weekly EPUB for delivery through KTool.

## Product guarantees

- Exactly 58 approved sources are registered.
- Exactly 10 distinct-source articles are selected for each published weekly edition.
- Each edition is available as a self-contained EPUB with a declared 1200×1600 Kindle cover.
- Extracted pages are sanitized, attributed, non-indexed, and retained for 90 days.
- Secrets belong in Railway or local environment variables, never in Git.
- The service remains useful without an AI provider through deterministic scoring and cover fallbacks.

## KTool delivery boundary

KTool's RSS and URL converter is a supported text-first compatibility path, but it does not reliably preserve a leading article image as the Kindle book cover. InkRelay therefore makes the cover-guaranteed edition available at `GET /f/:feedKey/weekly.epub`. That EPUB embeds all ten 1200×1600 grayscale covers, declares the first one as the publication cover in both EPUB 2 and EPUB 3 metadata, and stays below KTool's 20 MB document-upload limit. Use KTool's document upload for the weekly edition; do not subscribe to both the weekly proxy feed and upload the weekly EPUB, because that would duplicate delivery.

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
