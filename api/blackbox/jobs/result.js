import { pipeline } from 'node:stream/promises';

import { getObjectReadStream, getJob } from '../../_lib/jobStore.js';

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

    const job = await getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed' || !job.outputKey) {
      return res.status(202).json({
        jobId: job.jobId,
        status: job.status,
        error: job.error,
      });
    }

    const output = await getObjectReadStream(job.outputKey);

    res.statusCode = 200;
    res.setHeader('Content-Type', job.outputContentType || output.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${job.outputFilename || 'blackbox.out'}"`);
    if (output.contentLength) {
      res.setHeader('Content-Length', String(output.contentLength));
    }

    await pipeline(output.body, res);
  } catch (error) {
    console.error('[/api/blackbox/jobs/result]', error);

    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: error?.message || 'Result lookup failed' });
  }
}
