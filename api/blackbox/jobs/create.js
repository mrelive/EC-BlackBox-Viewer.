import { MultipartLimitError, getField, getUploadedBuffer, parseMultipart } from '../../_lib/multipart.js';
import {
  createJob,
  enqueueJob,
  getJobByIdempotencyKey,
  normalizeFormat,
  setIdempotencyMapping,
} from '../../_lib/jobStore.js';

export const config = { api: { bodyParser: false } };

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

    const origin = getApiOrigin(req);
    const statusUrl = `${origin}/api/blackbox/jobs/status?jobId=${encodeURIComponent(job.jobId)}`;
    const resultUrl = `${origin}/api/blackbox/jobs/result?jobId=${encodeURIComponent(job.jobId)}`;
    const processUrl = `${origin}/api/blackbox/jobs/process?jobId=${encodeURIComponent(job.jobId)}`;

    return res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      format: job.format,
      logIndex: job.logIndex,
      reused,
      statusUrl,
      resultUrl,
      processUrl,
    });
  } catch (error) {
    console.error('[/api/blackbox/jobs/create]', error);

    if (error instanceof MultipartLimitError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: error?.message || 'Job creation failed' });
  }
}
