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
 [x] Keep multipart parser and conversion logic unchanged
### Phase 3: Storage + Queue Refactor
- [ ] Replace @vercel/blob usage with MinIO (S3 API)
- [ ] Replace @vercel/kv usage with Redis client
- [ ] Keep job schema and status flow compatible
- [ ] Keep idempotency and lock semantics

### Phase 4: Worker Split
- [ ] Create dedicated worker process for runJob flow
- [ ] API enqueues and returns job metadata
- [ ] Worker executes decode, writes result object, updates job status
- [ ] Add retry/backoff and lock expiration handling

### Phase 5: Containerization and Coolify Deploy
- [ ] Add Dockerfile for API
- [ ] Add Dockerfile or command profile for worker
- [ ] Define env vars for API/worker/Redis/MinIO
- [ ] Deploy services in Coolify with persistent volumes for MinIO
- [ ] Configure domain routing to API service

### Phase 6: Validation
- [ ] Small sync decode test
- [ ] Large async decode test
- [ ] Status polling and result download test
- [ ] Retry behavior test
- [ ] Lock contention test

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
