# Operations

## Railway services

- `web`: persistent Next.js service with `/health/live` and `/health/ready` checks.
- `worker`: persistent pg-boss consumer with database heartbeat.
- `scheduler`: 15-minute UTC cron service that enqueues due work and exits.
- `postgres`: application database with daily and weekly backups.
- `covers`: private S3-compatible bucket.

The three application services build from the repository root. Point each Railway service at its
matching config file:

- Web: `/apps/web/railway.toml`
- Worker: `/apps/worker/railway.toml`
- Scheduler: `/apps/worker/railway.scheduler.toml`

Set the scheduler cron to `*/15 * * * *`. The process computes the editorial cutoff in
`America/Santiago`, enqueues idempotent due work, and exits. No long-running scheduler process is
required.

The current Railway bucket credentials specify `AWS_S3_URL_STYLE=virtual`. Keep the bucket private
and inject its credentials into both web and worker through Railway variable references; InkRelay
proxies assets through opaque `/assets/:assetAccessId` routes.

## Direct Kindle delivery

Each weekly publication produces ten independent Kindle documents, one for every selected source/article. Inline editorial images are downloaded and embedded at delivery time; unavailable or unsafe images are skipped without blocking the remaining article or edition. Delivery retries are tracked per document.

Configure these variables on the worker only:

- `KINDLE_DELIVERY_ENABLED=true`
- `KINDLE_DESTINATION_EMAIL` — the existing Send-to-Kindle address
- `KINDLE_SENDER_EMAIL` — a verified SES identity that is also approved by the Amazon account
- `SES_REGION`
- `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`, unless the runtime has an AWS role

Use a dedicated least-privilege IAM principal allowed only to call `ses:SendRawEmail` from the
verified identity. Do not reuse the Railway Bucket `AWS_*` credentials. Enabling delivery and
restarting the worker enqueues the latest published edition once; subsequent editions enqueue
immediately after atomic publication.

## Release

GitHub Actions runs formatting, linting, type checks, tests, builds, dependency auditing, and secret scanning. Railway autodeploys `main` only after successful check suites. Database migrations run as a pre-deploy command.

Connect every application service to `Cartterr/inkrelay`, deploy only `main`, and enable **Wait for
CI** after the workflow is visible. A failed check suite must skip deployment. Configure the web
health path as `/health/ready`; `/health/live` only proves the process is running.

Enable both daily and weekly backups on the PostgreSQL volume. Verify a recent worker heartbeat and
inspect the `dead-letter` pg-boss queue before promoting staging.

Official references: [monorepo deployments](https://docs.railway.com/deployments/monorepo),
[config as code](https://docs.railway.com/config-as-code),
[private storage buckets](https://docs.railway.com/storage-buckets),
[Wait for CI](https://docs.railway.com/deployments/github-autodeploys), and
[volume backups](https://docs.railway.com/volumes/backups).

## Legacy KTool rollback

Protected feeds and the weekly EPUB route remain available if direct delivery is unavailable. KTool
subscription changes remain outside deployment scope and require explicit action-time authorization.
