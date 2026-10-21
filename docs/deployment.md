# Server container deployment

This page describes the earlier server-container runtime. The current Windows client is 3.1.1; its signed update feed, acceptance and laptop handoff are recorded in [the release handoff](../tasks/agent-laptop-handoff-20261021.md). Do not use the Docker commands below to update the desktop installer or the separate Platform service.

## Prerequisites

- Linux server with Docker Engine and Docker Compose v2.
- Git access to this repository.
- DeepSeek API key.
- For production, the real Selection Center base URL and API key.

## Development or test server

The development stack runs two containers. The Mock is available only on the private Compose network; only DSH is published, and only on server loopback.

```bash
cp .env.example .env
# Set DEEPSEEK_API_KEY in .env.
docker compose --env-file .env -f docker/compose.dev.yml up -d --build
docker compose -f docker/compose.dev.yml ps
docker compose -f docker/compose.dev.yml logs -f futurestaff-dsh
```

Reach the server safely before an authenticated gateway exists:

```bash
ssh -L 3080:127.0.0.1:3080 user@your-server
```

Then open `http://127.0.0.1:3080` on your own computer.

## Production server

```bash
cp .env.production.example .env.production
# Fill every blank required value and restrict the file to the deployment user.
chmod 600 .env.production
docker compose --env-file .env.production -f docker/compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker/compose.prod.yml ps
```

Production Compose fails before creating the container when a required value is absent. It never defines or starts the Selection Center Mock.

## Reverse proxy

Keep `127.0.0.1:3080:3080`; do not publish `3080` on `0.0.0.0`. Put the supplied Nginx example behind HTTPS and an authenticated access layer. Until FutureStaff authentication is implemented, prefer an SSH tunnel or a strict VPN/IP allowlist rather than a public hostname.

Inside the image, DSH remains bound to `127.0.0.1:3081`. The container entrypoint supervises a fixed TCP forwarder from container port 3080 to that loopback listener. Do not change DSH back to `0.0.0.0`; current runtimes intentionally reject that unsafe binding. See [ADR-013](decisions/013-container-loopback-forwarder.md).

## Upgrade and rollback

```bash
git pull --ff-only
docker compose --env-file .env.production -f docker/compose.prod.yml build --pull
docker compose --env-file .env.production -f docker/compose.prod.yml up -d
```

Tag deployed images with an immutable version in `FUTURESTAFF_DSH_IMAGE`. Roll back by restoring the previous tag and running `up -d` again. The named `$DSH_HOME` volume is retained across replacements; back it up before any migration that changes persisted formats.

## Optional Local Runner gateway

The gateway is not started by normal Compose commands. Before enabling it, set `RUNNER_TENANT_ID`, `RUNNER_USER_ID`, `RUNNER_ID`, and `RUNNER_DEVICE_ID`, then run `npm run runner:enroll`. It creates ignored `runner/client/.env` and `runner-bindings.json` files. The raw token exists only in the client file; the binding contains its SHA-256 digest.

Copy the binding file to the server without printing it. Because the image runs as UID 1000, keep the mount readable only by that UID:

```bash
chown 1000:1000 runner-bindings.json
chmod 400 runner-bindings.json
```

Start the loopback-only gateway explicitly:

```bash
docker compose --profile runner --env-file .env -f docker/compose.dev.yml up -d --build runner-gateway
curl http://127.0.0.1:3090/healthz
```

Do not add `/runner/v1/connect` to Nginx until a real device token has been provisioned. Then place `docker/nginx/runner-location.conf.example` inside the TLS server block. Its exact-match route disables site Basic Auth only for the Runner path; the gateway still requires the device Bearer token.

For manual development, configure the ignored `runner/client/.env` and run `npm run runner:client`.

For installer enrollment, create an ignored `runner-enrollment/` directory with group ownership matching the Gateway user (UID/GID 1000) and setgid permissions, set `RUNNER_ENROLLMENT_OFFERS_DIR=../runner-enrollment` for Compose, and point `RUNNER_ENROLLMENT_OFFERS_FILE` at its `offers.json` file when issuing codes. The issued file is owner-write/group-read only. The directory mount allows atomic offer-file replacement to become visible without recreating the Gateway. Keep the Gateway state volume persistent.

```bash
RUNNER_TENANT_ID=tenant-id \
RUNNER_USER_ID=user-id \
RUNNER_ENROLLMENT_OFFERS_FILE=runner-enrollment/offers.json \
npm run runner:issue-code
```

Only give the returned code to the intended installer user. The offer file contains its SHA-256 digest, not the code. Add both exact Nginx locations from `docker/nginx/runner-location.conf.example`: WebSocket connect and HTTPS enrollment. The Gateway rate-limits enrollment and persists consumed codes plus device-token digests in its named state volume.

Build the private unsigned Alpha setup with `npm run installer:runner:windows`. Public distribution requires code signing.

To enable DSH-side `local_system_info`, generate a separate high-entropy internal token and set the same `RUNNER_DISPATCH_TOKEN` for the DSH and Gateway containers. Also configure `RUNNER_GATEWAY_INTERNAL_URL`, `RUNNER_ID`, and `RUNNER_DEVICE_ID`. The internal URL must use the server loopback/private network and must not be added to Nginx.

Operational questions are answered by the `internal_dispatch_completed`, `runner_job_completed`, and `local_runner_mcp_request_completed` structured events. They include correlation, outcome, and duration but never credentials, subject identity, arguments, or returned host information.

## Operational checks

- `docker compose ps` reports DSH healthy.
- DSH logs contain Selection Center completion events with operation, outcome, duration, and request ID.
- No log record contains API keys, tenant IDs, user IDs, or request bodies.
- A failed Selection Center call reports a stable error code instead of raw upstream content.
