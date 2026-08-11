# Architecture

```text
58-source registry -> scheduler -> durable jobs -> worker
                                          |-> feed ingestion
                                          |-> safe extraction
                                          |-> evaluation
                                          |-> cover rendering -> private bucket
                                          `-> weekly selection -> PostgreSQL

KTool -> protected proxy feed -> protected article page -> protected cover asset
Admin -> GitHub OAuth dashboard -> overrides, retries, previews, health
```

The web and worker services communicate only through typed database records and job contracts. Source-specific behavior stays behind ingestion adapters. AI providers and object storage are ports with deterministic/local and in-memory test implementations.

The Railway scheduler runs every 15 minutes in UTC and enqueues due work. Application code evaluates `America/Santiago` time so daylight-saving changes cannot move the Saturday 18:00 edition cutoff.
