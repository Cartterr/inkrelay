# Security

- All outbound article traffic is limited to HTTP/HTTPS and public IP space.
- Every redirect target is revalidated to prevent SSRF and DNS-rebinding pivots.
- Response size and time limits apply before parsing.
- Extracted markup passes through an explicit sanitization allowlist; scripts, embeds, forms, and event handlers are removed.
- Dashboard access is restricted to the configured GitHub login.
- Feed access keys are hashed for verification; article and asset access identifiers are independent random values.
- Application logs record route templates and hashes, never secret URLs or credentials.
- CI runs Gitleaks and dependency auditing before Railway deployment.
- Extracted bodies and cover assets expire after 90 days; metadata and audit events remain.
