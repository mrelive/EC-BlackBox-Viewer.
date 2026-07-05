# Coolify Deployment Wiring (TrueNAS)

## Scope
This document maps the migrated ECBBV runtime to Coolify services and environment variables.

## Services
Use four services in one Coolify stack:
- `ecbbv-api` (public HTTP service)
- `ecbbv-worker` (private background worker)
- `redis` (queue + job state)
- `minio` (S3-compatible object storage for result payloads)

Reference compose blueprint:
- `deploy/docker-compose.coolify.yml`

## Domain Routing
- Route only `ecbbv-api` through Traefik/public domain.
- Keep `ecbbv-worker`, `redis`, and `minio` internal to the stack.
- Existing expected route: `ecbbv.mrelive.com`.

## Required Environment Variables
Apply these to both `ecbbv-api` and `ecbbv-worker`:
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3000` (API only)
- `REDIS_URL=redis://redis:6379`
- `S3_ENDPOINT=http://minio:9000`
- `S3_REGION=us-east-1`
- `S3_ACCESS_KEY_ID=<minio-user>`
- `S3_SECRET_ACCESS_KEY=<minio-password>`
- `S3_BUCKET=blackbox-jobs`
- `S3_FORCE_PATH_STYLE=true`
- `BBL_MAX_FILE_SIZE_MB=200`
- `BBL_ASYNC_THRESHOLD_MB=10`
- `BBL_JOB_TTL_SECONDS=21600`
- `BBL_JOB_LOCK_TTL_SECONDS=60`
- `BBL_JOB_MAX_ATTEMPTS=3`
- `BBL_JOB_RETRY_BASE_MS=3000`
- `BBL_JOB_RETRY_MAX_MS=60000`

## MinIO Bootstrap
Create the target bucket once after MinIO starts:
- bucket name: `blackbox-jobs`

If you use the MinIO Console, verify:
- bucket exists
- access key/secret match Coolify env values

## Process Commands
- API command: `npm run api`
- Worker command: `npm run worker`

Both use the same image built from repository `Dockerfile`.

## Runtime Endpoints
- Health: `/healthz`
- Sync convert: `/api/blackbox/convert`
- Smart convert: `/api/blackbox/convert-smart`
- Detect flights: `/api/blackbox/detect-flights`
- Jobs create: `/api/blackbox/jobs/create`
- Jobs process: `/api/blackbox/jobs/process`
- Jobs status: `/api/blackbox/jobs/status`
- Jobs result: `/api/blackbox/jobs/result`

## Deployment Sequence
1. Update stack definition from `deploy/docker-compose.coolify.yml`.
2. Set environment variables in Coolify for API and Worker.
3. Deploy stack.
4. Verify API health endpoint returns `200`.
5. Verify worker logs show startup without missing-env errors.
6. Run functional decode tests after deployment.
