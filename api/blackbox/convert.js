/**
 * /api/blackbox/convert
 *
 * POST  multipart/form-data
 *   file       - BBL/BFL file (required)
 *   logIndex   - 0-based log index to decode (optional, default 0)
 *
 * Query params:
 *   format     - "csv" (default) | "json"
 *
 * Response (format=csv): text/csv
 * Response (format=json): application/json { fields, frames, sysConfig, logCount, logIndex }
 */

import { getFlightLog } from '../_lib/setup.js';
import { parseMultipart, getUploadedBuffer, getField } from '../_lib/multipart.js';

// Disable Vercel's default body parser so busboy can read the raw stream.
export const config = { api: { bodyParser: false, responseLimit: '50mb' } };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

/**
 * Build a CSV string from an open FlightLog instance.
 * Mirrors the format that the PIDS analyzers expect:
 *   - sysConfig key/value "header" rows at the top
 *   - a quoted column-name row
 *   - one data row per frame
 */
function buildCsv(flightLog, fieldNames, sysConfig, minTime, maxTime) {
  const rows = [];

  rows.push('"Product","Blackbox flight data recorder by Nicholas Sherlock"');

  if (sysConfig && typeof sysConfig === 'object') {
    for (const key of Object.keys(sysConfig)) {
      const v = sysConfig[key];
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        rows.push(`"${key}","${v.join(',')}"`);
      } else if (typeof v === 'string') {
        rows.push(`"${key}","${v.replace(/"/g, '""')}"`);
      } else {
        rows.push(`"${key}",${v}`);
      }
    }
  }

  rows.push(fieldNames.map((n) => `"${n}"`).join(','));

  const chunks = flightLog.getChunksInTimeRange(minTime, maxTime);
  for (const chunk of chunks) {
    for (const frame of chunk.frames) {
      rows.push(frame.map((v) => (v == null ? 'NaN' : v)).join(','));
    }
  }

  return rows.join('\n');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fields, files } = await parseMultipart(req);

    const fileBuffer = getUploadedBuffer(files, 'file');

    const logIndexRaw = getField(fields, 'logIndex') ?? req.query?.logIndex ?? '0';
    const logIndex = Math.max(0, parseInt(logIndexRaw, 10) || 0);

    const format = String(
      req.query?.format ?? getField(fields, 'format') ?? 'csv'
    ).toLowerCase();

    const FlightLog = await getFlightLog();
    const flightLog = new FlightLog(fileBuffer);

    const logCount = flightLog.getLogCount();
    if (!logCount) {
      return res.status(422).json({ error: 'No valid logs found in file' });
    }

    const idx = Math.min(logIndex, logCount - 1);

    if (!flightLog.openLog(idx)) {
      const logError = flightLog.getLogError ? flightLog.getLogError(idx) : 'unknown';
      return res.status(422).json({ error: `Failed to open log ${idx}: ${logError}` });
    }

    const fieldNames = flightLog.getMainFieldNames();
    const sysConfig = flightLog.getSysConfig();
    const minTime = flightLog.getMinTime();
    const maxTime = flightLog.getMaxTime();

    if (format === 'json') {
      const frames = [];
      const chunks = flightLog.getChunksInTimeRange(minTime, maxTime);
      for (const chunk of chunks) {
        for (const frame of chunk.frames) {
          frames.push(frame.map((v) => (v == null ? null : v)));
        }
      }
      return res.status(200).json({ fields: fieldNames, frames, sysConfig, logCount, logIndex: idx });
    }

    // Default: CSV
    const csv = buildCsv(flightLog, fieldNames, sysConfig, minTime, maxTime);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="blackbox.csv"');
    return res.status(200).send(csv);

  } catch (err) {
    console.error('[/api/blackbox/convert]', err);
    return res.status(500).json({ error: err?.message || 'Conversion failed' });
  }
}
