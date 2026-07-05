import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createClient } from 'redis';

const JOB_KEY_PREFIX = 'bbl:job:';
const IDEMPOTENCY_KEY_PREFIX = 'bbl:idempotency:';
const JOB_LOCK_KEY_PREFIX = 'bbl:lock:';
const JOB_QUEUE_KEY = 'bbl:queue';

const DEFAULT_JOB_TTL_SECONDS = 60 * 60 * 6;
const DEFAULT_JOB_LOCK_TTL_SECONDS = 60;
const DEFAULT_JOB_MAX_ATTEMPTS = 3;
const DEFAULT_JOB_RETRY_BASE_MS = 3000;
const DEFAULT_JOB_RETRY_MAX_MS = 60000;

let redisClient = null;
let redisConnectPromise = null;
let s3Client = null;

export class JobStoreConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JobStoreConfigError';
    this.statusCode = 500;
  }
}

function requireEnv(name, fallback = '') {
  const value = process.env[name] ?? fallback;
  if (!String(value).trim()) {
    throw new JobStoreConfigError(`Missing required environment variable: ${name}`);
  }
  return String(value);
}

function ensureConfigured() {
  requireEnv('REDIS_URL');
  requireEnv('S3_BUCKET');
  requireEnv('S3_ACCESS_KEY_ID');
  requireEnv('S3_SECRET_ACCESS_KEY');

  if (!process.env.S3_ENDPOINT && !process.env.AWS_REGION && !process.env.S3_REGION) {
    throw new JobStoreConfigError('Set S3_ENDPOINT (for MinIO) or AWS/S3 region values.');
  }
}

function getJobTtlSeconds() {
  const raw = Number.parseInt(String(process.env.BBL_JOB_TTL_SECONDS ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JOB_TTL_SECONDS;
}

export function getJobLockTtlSeconds() {
  const raw = Number.parseInt(String(process.env.BBL_JOB_LOCK_TTL_SECONDS ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JOB_LOCK_TTL_SECONDS;
}

export function getJobMaxAttempts() {
  const raw = Number.parseInt(String(process.env.BBL_JOB_MAX_ATTEMPTS ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JOB_MAX_ATTEMPTS;
}

export function getRetryBaseMs() {
  const raw = Number.parseInt(String(process.env.BBL_JOB_RETRY_BASE_MS ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JOB_RETRY_BASE_MS;
}

export function getRetryMaxMs() {
  const raw = Number.parseInt(String(process.env.BBL_JOB_RETRY_MAX_MS ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JOB_RETRY_MAX_MS;
}

export function computeRetryDelayMs(attemptNumber) {
  const exponent = Math.max(0, Number(attemptNumber || 1) - 1);
  return Math.min(getRetryBaseMs() * (2 ** exponent), getRetryMaxMs());
}

function nowIso() {
  return new Date().toISOString();
}

function buildJobKey(jobId) {
  return `${JOB_KEY_PREFIX}${jobId}`;
}

function buildIdempotencyKey(idempotencyKey) {
  return `${IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`;
}

function buildJobLockKey(jobId) {
  return `${JOB_LOCK_KEY_PREFIX}${jobId}`;
}

function sanitizeFilename(input) {
  return String(input || 'upload.bbl').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function getRedis() {
  ensureConfigured();

  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (error) => console.error('[redis]', error));
  }

  if (!redisClient.isOpen) {
    if (!redisConnectPromise) {
      redisConnectPromise = redisClient.connect().finally(() => {
        redisConnectPromise = null;
      });
    }
    await redisConnectPromise;
  }

  return redisClient;
}

function getS3() {
  ensureConfigured();

  if (!s3Client) {
    const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || 'true').toLowerCase() === 'true';

    s3Client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  return s3Client;
}

function getBucket() {
  return requireEnv('S3_BUCKET');
}

function parseJob(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeFormat(input) {
  return String(input || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
}

export async function createJob({ filename, mimeType, format, logIndex, fileBuffer }) {
  const redis = await getRedis();
  const s3 = getS3();

  const jobId = randomUUID();
  const ext = normalizeFormat(format) === 'json' ? 'json' : 'csv';
  const inputKey = `blackbox/jobs/${jobId}/input-${sanitizeFilename(filename)}`;

  await s3.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: inputKey,
    Body: fileBuffer,
    ContentType: mimeType || 'application/octet-stream',
  }));

  const record = {
    jobId,
    status: 'queued',
    format: normalizeFormat(format),
    logIndex: Math.max(0, Number.parseInt(String(logIndex), 10) || 0),
    inputKey,
    outputKey: null,
    outputContentType: null,
    outputFilename: `blackbox.${ext}`,
    error: null,
    attempts: 0,
    nextRetryAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
  };

  await redis.set(buildJobKey(jobId), JSON.stringify(record), { EX: getJobTtlSeconds() });
  return record;
}

export async function getJob(jobId) {
  if (!jobId) return null;
  const redis = await getRedis();
  const raw = await redis.get(buildJobKey(jobId));
  return parseJob(raw);
}

export async function updateJob(jobId, patch) {
  const redis = await getRedis();
  const existing = await getJob(jobId);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };

  await redis.set(buildJobKey(jobId), JSON.stringify(updated), { EX: getJobTtlSeconds() });
  return updated;
}

export async function getJobByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) return null;
  const redis = await getRedis();
  const jobId = await redis.get(buildIdempotencyKey(idempotencyKey));
  if (!jobId) return null;
  return getJob(jobId);
}

export async function setIdempotencyMapping(idempotencyKey, jobId) {
  if (!idempotencyKey || !jobId) return;
  const redis = await getRedis();
  await redis.set(buildIdempotencyKey(idempotencyKey), jobId, { EX: getJobTtlSeconds() });
}

export async function acquireJobLock(jobId, lockOwner) {
  const redis = await getRedis();
  const owner = lockOwner || `proc-${Date.now()}`;
  const result = await redis.set(buildJobLockKey(jobId), owner, {
    NX: true,
    EX: getJobLockTtlSeconds(),
  });
  return result === 'OK' ? owner : null;
}

export async function releaseJobLock(jobId, lockOwner) {
  const redis = await getRedis();
  const key = buildJobLockKey(jobId);
  const current = await redis.get(key);
  if (current && current === lockOwner) {
    await redis.del(key);
    return true;
  }
  return false;
}

export async function enqueueJob(jobId) {
  const redis = await getRedis();
  await redis.rPush(JOB_QUEUE_KEY, jobId);
}

export async function dequeueJob(timeoutSeconds = 5) {
  const redis = await getRedis();
  const item = await redis.blPop(JOB_QUEUE_KEY, timeoutSeconds);
  if (!item || !item.element) return null;
  return item.element;
}

export async function storeJobOutput(jobId, { streamOrBuffer, contentType, filename }) {
  const s3 = getS3();
  const safeName = sanitizeFilename(filename);
  const key = `blackbox/jobs/${jobId}/output-${safeName}`;

  await s3.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: streamOrBuffer,
    ContentType: contentType || 'application/octet-stream',
  }));

  return {
    key,
    contentType: contentType || 'application/octet-stream',
  };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readObjectBuffer(key) {
  const s3 = getS3();
  const response = await s3.send(new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  }));

  return streamToBuffer(response.Body);
}

export async function getObjectReadStream(key) {
  const s3 = getS3();
  const response = await s3.send(new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  }));
  return {
    body: response.Body,
    contentLength: response.ContentLength,
    contentType: response.ContentType,
  };
}
