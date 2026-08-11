# Architecture

```text
58-source registry -> scheduler -> durable jobs -> worker
                                          |-> feed ingestion
                                          |-> safe extraction
                                          |-> evaluation
                                          |-> cover rendering -> private bucket
                                          `-> weekly selection -> PostgreSQL

KTool RSS (legacy, text-first) -> protected proxy feed -> protected article page
KTool document upload (cover-guaranteed) -> protected weekly EPUB -> embedded declared cover + ten covered articles
Admin -> GitHub OAuth dashboard -> overrides, retries, previews, health
```

The web and worker services communicate only through typed database records and job contracts. Source-specific behavior stays behind ingestion adapters. AI providers and object storage are ports with deterministic/local and in-memory test implementations.

The two KTool paths are intentionally different. KTool's server-side RSS/URL conversion controls its generated EPUB and may discard leading images, so InkRelay does not claim a cover guarantee for that path. The protected weekly EPUB is the authoritative publication artifact: its package manifest declares a 1200×1600 PNG cover, its cover page is first in the spine, and every selected article retains its own embedded cover. KTool handles document delivery without rebuilding that artifact.

The Railway scheduler runs every 15 minutes in UTC and enqueues due work. Application code evaluates `America/Santiago` time so daylight-saving changes cannot move the Saturday 18:00 edition cutoff.
