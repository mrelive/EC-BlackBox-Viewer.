# ECBBV Coolify/TrueNAS Migration Checklist

## Goal
Migrate BBL decode service from Vercel serverless limits to self-hosted Coolify on TrueNAS using:
- API service
- Worker service
- Redis
- MinIO (S3-compatible object storage)

## Current Baseline
- Current branch: master
- Safety branch created: backup/pre-coolify-migration-20260705-1527
- Current HEAD: d94222529a20d3b490a9fe8c4bb1b55107f1bea2
- Target rollback commit: d94222529a20d3b490a9fe8c4bb1b55107f1bea2

## TrueNAS/Coolify Facts Collected
- Host: truenas (Linux 6.12.91-production+truenas)
- Coolify root: /data/coolify
- ECBBV app UUID: nmw394vql5fbvqaw7ttnj9xk
- ECBBV compose path: /data/coolify/applications/nmw394vql5fbvqaw7ttnj9xk/docker-compose.yaml
- ECBBV env path: /data/coolify/applications/nmw394vql5fbvqaw7ttnj9xk/.env
- Deployed commit on server: d94222529a20d3b490a9fe8c4bb1b55107f1bea2
- Current Coolify image tag: nmw394vql5fbvqaw7ttnj9xk:d94222529a20d3b490a9fe8c4bb1b55107f1bea2
- Domain route: ecbbv.mrelive.com via Traefik label rule Host(`ecbbv.mrelive.com`) && PathPrefix(`/`)
- Service port in compose: 80

## Step-by-step Execution

### Phase 1: Git Baseline and Rollback
- [x] Create safety branch from current HEAD
- [x] Reset local master to d94222529a20d3b490a9fe8c4bb1b55107f1bea2
- [x] Verify HEAD and clean working tree

Commands:
```powershell
git reset --hard d94222529a20d3b490a9fe8c4bb1b55107f1bea2
git rev-parse HEAD
git status
```

### Phase 2: Runtime Refactor (Vercel -> Portable Node)
- [x] Keep multipart parser and conversion logic unchanged
- [x] Add portable Node API entrypoint (`server.js`) with direct route dispatch
- [x] Add health endpoint (`/healthz`) and request/response compatibility shim

### Phase 3: Storage + Queue Refactor
- [x] Replace @vercel/blob usage with MinIO (S3 API)
- [x] Replace @vercel/kv usage with Redis client
- [x] Keep job schema and status flow compatible
- [x] Keep idempotency and lock semantics

### Phase 4: Worker Split
- [x] Create dedicated worker process for runJob flow
- [x] API enqueues and returns job metadata
- [x] Worker executes decode, writes result object, updates job status
- [x] Add retry/backoff and lock expiration handling

### Phase 5: Containerization and Coolify Deploy
- [x] Add Dockerfile for API
- [x] Add Dockerfile or command profile for worker
- [x] Define env vars for API/worker/Redis/MinIO
- [x] Create compose blueprint for api + worker + redis + minio
- [x] Document domain routing expectations for API service

### Phase 6: Validation
- [ ] Small sync decode test
- [ ] Large async decode test
- [ ] Status polling and result download test
- [ ] Retry behavior test
- [ ] Lock contention test
- [x] API boot check (`npm run api`)
- [x] Worker boot path check (missing env now fails fast and exits)
- [x] Worker dependency path check (with env set, reaches Redis connect)

## Required Environment Variables (Target)
- NODE_ENV
- PORT
- REDIS_URL
- S3_ENDPOINT
- S3_REGION
- S3_ACCESS_KEY_ID
- S3_SECRET_ACCESS_KEY
- S3_BUCKET
- S3_FORCE_PATH_STYLE=true
- BBL_MAX_FILE_SIZE_MB
- BBL_ASYNC_THRESHOLD_MB
- BBL_JOB_TTL_SECONDS
- BBL_JOB_LOCK_TTL_SECONDS
- BBL_JOB_MAX_ATTEMPTS
- BBL_JOB_RETRY_BASE_MS
- BBL_JOB_RETRY_MAX_MS

## Notes
- Do not remove existing decode algorithm; only migrate runtime and infrastructure.
- Keep API contract stable for frontend compatibility.
- `.env.local` and `.vercel/` are local-only artifacts and should remain uncommitted.
