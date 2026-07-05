/**
 * /api/blackbox/detect-flights
 *
 * POST  multipart/form-data
 *   file  - BBL/BFL file (required)
 *
 * Response: application/json
 *   { logCount: number }
 */

import { getFlightLog } from '../_lib/setup.js';
import { MultipartLimitError, getUploadedBuffer, parseMultipart } from '../_lib/multipart.js';

export const config = { api: { bodyParser: false } };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { files } = await parseMultipart(req);
    const fileBuffer = getUploadedBuffer(files, 'file');

    const FlightLog = await getFlightLog();
    const flightLog = new FlightLog(fileBuffer);

    const logCount = Math.max(1, flightLog.getLogCount() || 1);

    return res.status(200).json({ logCount });

  } catch (err) {
    console.error('[/api/blackbox/detect-flights]', err);
    if (err instanceof MultipartLimitError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: err?.message || 'Detection failed' });
  }
}
