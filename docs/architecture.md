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

The weekly EPUB is the authoritative publication artifact: its package manifest declares a 1200×1600 PNG cover, its cover page is first in the spine, and every selected article retains its own embedded cover. The worker sends that exact artifact to the existing Kindle document address through a dedicated Amazon SES identity. Delivery state is durable and duplicate-resistant; a provider-accepted but unconfirmed attempt remains `sending` and fails closed.

The Railway scheduler runs every 15 minutes in UTC and enqueues due work. Application code evaluates `America/Santiago` time so daylight-saving changes cannot move the Saturday 18:00 edition cutoff.
