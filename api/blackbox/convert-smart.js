import { prepareFlightLogPayload, writeCsvPayload, writeJsonPayload } from '../_lib/flightlogConversion.js';
import { runJob } from '../_lib/jobProcessor.js';
import {
  createJob,
  enqueueJob,
  getJobByIdempotencyKey,
  normalizeFormat,
  setIdempotencyMapping,
} from '../_lib/jobStore.js';
import { MultipartLimitError, getField, getUploadedBuffer, parseMultipart } from '../_lib/multipart.js';
import { getFlightLog } from '../_lib/setup.js';

export const config = { api: { bodyParser: false, responseLimit: false } };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Idempotency-Key');
}

function getApiOrigin(req) {
  const proto = 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function getAsyncThresholdBytes() {
  const raw = Number.parseInt(String(process.env.BBL_ASYNC_THRESHOLD_MB ?? ''), 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : 10;
  return mb * 1024 * 1024;
}

function buildAsyncUrls(req, jobId) {
  const origin = getApiOrigin(req);
  return {
    statusUrl: `${origin}/api/blackbox/jobs/status?jobId=${encodeURIComponent(jobId)}`,
    resultUrl: `${origin}/api/blackbox/jobs/result?jobId=${encodeURIComponent(jobId)}`,
    processUrl: `${origin}/api/blackbox/jobs/process?jobId=${encodeURIComponent(jobId)}`,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fields, files } = await parseMultipart(req);

    const fileEntry = files.file;
    const fileBuffer = getUploadedBuffer(files, 'file');
    const format = normalizeFormat(getField(fields, 'format') ?? req.query?.format ?? 'csv');
    const logIndexRaw = getField(fields, 'logIndex') ?? req.query?.logIndex ?? '0';
    const logIndex = Math.max(0, Number.parseInt(String(logIndexRaw), 10) || 0);

    const idempotencyKey = String(
      getField(fields, 'idempotencyKey') ?? req.query?.idempotencyKey ?? req.headers['x-idempotency-key'] ?? ''
    ).trim();

    if (fileBuffer.length > getAsyncThresholdBytes()) {
      let job = null;
      let reused = false;

      if (idempotencyKey) {
        const existingJob = await getJobByIdempotencyKey(idempotencyKey);
        if (existingJob) {
          job = existingJob;
          reused = true;
        }
      }

      if (!job) {
        job = await createJob({
          filename: fileEntry?.filename,
          mimeType: fileEntry?.mimeType,
          format,
          logIndex,
          fileBuffer,
        });

        if (idempotencyKey) {
          await setIdempotencyMapping(idempotencyKey, job.jobId);
        }

        await enqueueJob(job.jobId);
      }

      const urls = buildAsyncUrls(req, job.jobId);

      return res.status(202).json({
        mode: 'async',
        reused,
        jobId: job.jobId,
        status: job.status,
        format: job.format,
        logIndex: job.logIndex,
        ...urls,
      });
    }

    const FlightLog = await getFlightLog();
    const payload = prepareFlightLogPayload(FlightLog, fileBuffer, logIndex);

    if (format === 'json') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      await writeJsonPayload(res, payload);
      return res.end();
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="blackbox.csv"');
    await writeCsvPayload(res, payload);
    return res.end();
  } catch (error) {
    console.error('[/api/blackbox/convert-smart]', error);

    if (error instanceof MultipartLimitError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: error?.message || 'Smart conversion failed' });
  }
}
