import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareFlightLogPayload, writeCsvPayload, writeJsonPayload } from './flightlogConversion.js';
import { getFlightLog } from './setup.js';
import {
  acquireJobLock,
  computeRetryDelayMs,
  getJob,
  getJobMaxAttempts,
  readObjectBuffer,
  releaseJobLock,
  storeJobOutput,
  updateJob,
} from './jobStore.js';

async function finalizeWritable(writable) {
  await new Promise((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
    writable.end();
  });
}

export async function runJob(jobId) {
  const existing = await getJob(jobId);
  if (!existing) {
    const err = new Error('Job not found');
    err.statusCode = 404;
    throw err;
  }

  if (existing.status === 'completed' || existing.status === 'processing') {
    return existing;
  }

  const maxAttempts = getJobMaxAttempts();
  const attempts = Number(existing.attempts || 0);
  if (existing.status === 'failed' && attempts >= maxAttempts) {
    return existing;
  }

  if (existing.status === 'failed' && existing.nextRetryAt) {
    const retryAtMs = Date.parse(existing.nextRetryAt);
    if (Number.isFinite(retryAtMs) && Date.now() < retryAtMs) {
      const err = new Error(`Job backoff active until ${existing.nextRetryAt}`);
      err.statusCode = 429;
      throw err;
    }
  }

  const lockOwner = await acquireJobLock(jobId, `proc-${Date.now()}`);
  if (!lockOwner) {
    return (await getJob(jobId)) || existing;
  }

  let workDir = null;
  try {
    const processing = await updateJob(jobId, {
      status: 'processing',
      attempts: attempts + 1,
      error: null,
      nextRetryAt: null,
      startedAt: new Date().toISOString(),
      processorId: lockOwner,
    });

    const inputBuffer = await readObjectBuffer(processing.inputKey);
    const FlightLog = await getFlightLog();
    const payload = prepareFlightLogPayload(FlightLog, inputBuffer, processing.logIndex);

    const format = processing.format === 'json' ? 'json' : 'csv';
    const ext = format === 'json' ? 'json' : 'csv';
    const contentType = format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';

    workDir = await mkdtemp(join(tmpdir(), 'bbl-job-'));
    const outputPath = join(workDir, `output.${ext}`);
    const writable = createWriteStream(outputPath, { encoding: 'utf8' });

    if (format === 'json') {
      await writeJsonPayload(writable, payload);
    } else {
      await writeCsvPayload(writable, payload);
    }
    await finalizeWritable(writable);

    const output = await storeJobOutput(jobId, {
      streamOrBuffer: createReadStream(outputPath),
      contentType,
      filename: `blackbox.${ext}`,
    });

    return await updateJob(jobId, {
      status: 'completed',
      outputKey: output.key,
      outputContentType: output.contentType,
      outputFilename: `blackbox.${ext}`,
      completedAt: new Date().toISOString(),
      error: null,
      nextRetryAt: null,
      processorId: null,
    });
  } catch (error) {
    const latest = await getJob(jobId);
    const latestAttempts = Number(latest?.attempts || attempts || 0);
    const retryDelayMs = computeRetryDelayMs(Math.max(1, latestAttempts));

    await updateJob(jobId, {
      status: 'failed',
      error: error?.message || 'Job failed',
      nextRetryAt: new Date(Date.now() + retryDelayMs).toISOString(),
      processorId: null,
    });
    throw error;
  } finally {
    await releaseJobLock(jobId, lockOwner).catch(() => {});
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
