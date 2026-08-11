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

## KTool cutover

1. Validate a generated page through Quick Send.
2. Pilot ACM SIGGRAPH Blog, Interconnects AI, and Game Developer.
3. Replace five subscriptions individually.
4. Replace remaining subscriptions in batches of ten.
5. Observe a complete weekly cycle.

Never remove an original subscription until the matching proxy has been verified and the operator explicitly authorizes the removal.
