import { getJob } from '../../_lib/jobStore.js';
import { runJob } from '../../_lib/jobProcessor.js';

export const config = { api: { bodyParser: false } };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const jobId = String(req.query?.jobId || '').trim();
    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId' });
    }

    const shouldRun = ['1', 'true', 'yes'].includes(String(req.query?.run || '').toLowerCase());
    if (shouldRun) {
      await runJob(jobId);
    }

    const job = await getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json({
      jobId: job.jobId,
      status: job.status,
      format: job.format,
      logIndex: job.logIndex,
      attempts: job.attempts,
      nextRetryAt: job.nextRetryAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      error: job.error,
    });
  } catch (error) {
    console.error('[/api/blackbox/jobs/status]', error);

    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: error?.message || 'Status lookup failed' });
  }
}
