# InkRelay

InkRelay is a private reading pipeline for Kindle. It curates a fixed set of trusted technical feeds, produces high-contrast monochrome editorial covers, builds a self-contained weekly EPUB, and delivers it directly to Amazon Send to Kindle through Amazon SES.

## Product guarantees

- Exactly 58 approved sources are registered.
- Exactly 10 distinct-source articles are selected for each published weekly edition.
- Each edition is available as a self-contained EPUB with a declared 1200×1600 Kindle cover.
- Each published edition is sent once through a durable, auditable, duplicate-resistant delivery job.
- Extracted pages are sanitized, attributed, non-indexed, and retained for 90 days.
- Secrets belong in Railway or local environment variables, never in Git.
- The service remains useful without an AI provider through deterministic scoring and cover fallbacks.

## Direct Kindle delivery

The persistent worker sends the cover-guaranteed EPUB from a verified Amazon SES sender to the account's existing `@kindle.com` document address. The sender must also be present in Amazon's Approved Personal Document Email List. Delivery credentials use dedicated `SES_*` variables and never reuse Railway Bucket credentials. A PostgreSQL delivery record prevents repeat sends after success and fails closed if the provider accepted a message but its acknowledgement could not be persisted.

Protected feeds and `GET /f/:feedKey/weekly.epub` remain available as reversible compatibility and diagnostic paths. KTool is no longer required for the primary weekly delivery.

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
