# InkRelay Design

## Purpose

InkRelay is a professional personal reading pipeline for one operator. It ingests only the 58 KTool-confirmed sources, selects exactly ten substantial articles each week, produces high-contrast monochrome covers, and exposes protected feeds and article pages that KTool can convert and deliver to Kindle.

## Architecture

The TypeScript monorepo deploys a Next.js web service, a persistent worker, and an idempotent Railway cron scheduler. PostgreSQL stores domain state and durable jobs. A private S3-compatible Railway Bucket stores generated covers. Shared packages isolate domain behavior, database concerns, and rendering.

Ingestion follows a code-owned source allowlist. RSS and Atom sources use conditional HTTP requests; homepage-only entries use standards-based feed autodiscovery; Hacker News uses its official best-stories API. Article fetches enforce protocol, DNS, redirect, size, and timeout restrictions before Readability extraction and HTML sanitization.

## Curation

Candidates receive deterministic quality signals and optional structured AI evaluation. Every published edition contains exactly ten distinct sources, normally no more than three articles per category, with diversity across the user's interests. Publication is atomic and fails closed if ten valid candidates are unavailable.

## Presentation

Covers are 1200×1600 grayscale PNGs. Source images are cropped, contrast-adjusted, posterized, and combined with editorial typography. An AI provider may supply missing artwork. Deterministic category artwork is the final fallback. Article pages include the cover, metadata, summary, sanitized body, attribution, and canonical link.

## Privacy and operations

The dashboard uses GitHub OAuth restricted to `Cartterr`. Feed paths use a 256-bit secret; article and asset routes use independent opaque identifiers. Pages are non-indexed, request logs redact private identifiers, and extracted content expires after 90 days. Staging precedes production, CI gates Railway autodeploys, and KTool replacement occurs only after source-by-source verification and explicit authorization.
