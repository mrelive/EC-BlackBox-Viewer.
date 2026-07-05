function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function writeLine(writable, line) {
  if (writable.write(`${line}\n`)) return;
  await new Promise((resolve, reject) => {
    writable.once('drain', resolve);
    writable.once('error', reject);
  });
}

export function prepareFlightLogPayload(FlightLog, fileBuffer, logIndexRaw = 0) {
  const flightLog = new FlightLog(fileBuffer);
  const logCount = flightLog.getLogCount();

  if (!logCount) {
    const err = new Error('No valid logs found in file');
    err.statusCode = 422;
    throw err;
  }

  const logIndex = Math.max(0, Number.parseInt(String(logIndexRaw), 10) || 0);
  const index = Math.min(logIndex, logCount - 1);

  if (!flightLog.openLog(index)) {
    const logError = flightLog.getLogError ? flightLog.getLogError(index) : 'unknown';
    const err = new Error(`Failed to open log ${index}: ${logError}`);
    err.statusCode = 422;
    throw err;
  }

  const fieldNames = flightLog.getMainFieldNames();
  const sysConfig = flightLog.getSysConfig() || {};
  const minTime = flightLog.getMinTime();
  const maxTime = flightLog.getMaxTime();

  return {
    flightLog,
    fieldNames,
    sysConfig,
    minTime,
    maxTime,
    logCount,
    logIndex: index,
  };
}

export async function writeCsvPayload(writable, payload) {
  const { flightLog, fieldNames, sysConfig, minTime, maxTime } = payload;

  await writeLine(writable, '"Product","Blackbox flight data recorder by Nicholas Sherlock"');

  for (const key of Object.keys(sysConfig)) {
    const value = sysConfig[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      await writeLine(writable, `"${key}","${value.join(',')}"`);
    } else if (typeof value === 'string') {
      await writeLine(writable, `"${key}","${value.replace(/"/g, '""')}"`);
    } else {
      await writeLine(writable, `"${key}",${value}`);
    }
  }

  await writeLine(writable, fieldNames.map((name) => csvEscape(name)).join(','));

  const chunks = flightLog.getChunksInTimeRange(minTime, maxTime);
  for (const chunk of chunks) {
    for (const frame of chunk.frames) {
      const row = frame.map((value) => (value == null ? 'NaN' : value)).join(',');
      await writeLine(writable, row);
    }
  }
}

export async function writeJsonPayload(writable, payload) {
  const { flightLog, fieldNames, sysConfig, minTime, maxTime, logCount, logIndex } = payload;

  const header = {
    fields: fieldNames,
    sysConfig,
    logCount,
    logIndex,
  };

  const prefix = JSON.stringify(header).replace(/}\s*$/, '');
  await writeLine(writable, `${prefix},"frames":[`);

  let firstFrame = true;
  const chunks = flightLog.getChunksInTimeRange(minTime, maxTime);
  for (const chunk of chunks) {
    for (const frame of chunk.frames) {
      const jsonFrame = JSON.stringify(frame.map((value) => (value == null ? null : value)));
      if (firstFrame) {
        firstFrame = false;
        await writeLine(writable, jsonFrame);
      } else {
        await writeLine(writable, `,${jsonFrame}`);
      }
    }
  }

  await writeLine(writable, ']}');
}
