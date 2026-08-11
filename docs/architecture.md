# Architecture

```text
58-source registry -> scheduler -> durable jobs -> worker
                                          |-> feed ingestion
                                          |-> safe extraction
                                          |-> evaluation
                                          |-> cover rendering -> private bucket
                                          `-> weekly selection -> EPUB -> Amazon SES -> Send to Kindle

Compatibility path -> protected feeds/pages and downloadable weekly EPUB
Admin -> GitHub OAuth dashboard -> overrides, retries, previews, health
```

The web and worker services communicate only through typed database records and job contracts. Source-specific behavior stays behind ingestion adapters. AI providers and object storage are ports with deterministic/local and in-memory test implementations.

Each selected article is an authoritative Kindle artifact: its package manifest declares a 1200×1600 PNG cover, the cover page is first in the spine, and the complete sanitized body follows. Relevant article images are fetched through the SSRF-safe client, rasterized as bounded grayscale JPEGs, and stored inside the EPUB rather than referenced remotely. The worker sends ten separate artifacts through a dedicated Amazon SES identity. Edition and per-document delivery state are durable; retries skip acknowledged documents and continue the remaining set. The combined weekly EPUB remains a compatibility download only.

The Railway scheduler runs every 15 minutes in UTC and enqueues due work. Application code evaluates `America/Santiago` time so daylight-saving changes cannot move the Saturday 18:00 edition cutoff.
