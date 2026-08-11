# Security Policy

Please report vulnerabilities privately through GitHub Security Advisories. Do not open a public
issue for suspected credential exposure, access-control bypasses, SSRF, or content-sanitization
failures.

InkRelay treats feed URLs, article identifiers, asset identifiers, OAuth material, model keys, and
storage credentials as sensitive. Production logs contain route and job names plus hashed internal
identifiers, never complete protected URLs.

Supported releases are the current `main` branch and the currently deployed production revision.
