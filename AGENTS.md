# InkRelay agent guidance

- The approved 58-source registry is the sole ingestion allowlist. Do not add discovered sources automatically.
- Never commit, print, or document credentials, feed keys, OAuth secrets, full private URLs, or provider keys.
- Use test-driven development for domain behavior and extraction/security changes.
- Keep KTool subscription mutation outside automated deployment; cutover requires explicit action-time authorization.
- Work on feature branches and require the full `pnpm verify` gate before publishing changes.
