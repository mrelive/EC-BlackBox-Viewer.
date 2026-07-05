/**
 * multipart.js
 * Lightweight multipart/form-data parser using busboy.
 * Collects file contents into a Buffer in memory — no temp files.
 */

import busboy from 'busboy';

const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function resolveMaxFileSizeBytes() {
  const raw = process.env.BBL_MAX_FILE_SIZE_MB;
  const mb = Number.parseInt(String(raw ?? ''), 10);
  if (Number.isFinite(mb) && mb > 0) {
    return mb * 1024 * 1024;
  }
  return DEFAULT_MAX_FILE_SIZE_BYTES;
}

export class MultipartLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MultipartLimitError';
    this.statusCode = 413;
  }
}

/**
 * Parse a multipart request.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ files: Record<string, { buffer: Buffer, filename: string, mimeType: string }>, fields: Record<string, string> }>}
 */
export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const maxFileSizeBytes = resolveMaxFileSizeBytes();
    const bb = busboy({ headers: req.headers, limits: { fileSize: maxFileSizeBytes } });
    const files = {};
    const fields = {};
    let settled = false;

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    bb.on('file', (fieldname, stream, info) => {
      const chunks = [];
      let exceededFileSize = false;
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        exceededFileSize = true;
      });
      stream.on('end', () => {
        if (exceededFileSize) {
          return rejectOnce(
            new MultipartLimitError(`Uploaded file exceeds ${Math.floor(maxFileSizeBytes / (1024 * 1024))} MB limit`)
          );
        }
        files[fieldname] = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || 'upload',
          mimeType: info.mimeType || 'application/octet-stream',
        };
      });
      stream.on('error', rejectOnce);
    });

    bb.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    bb.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve({ files, fields });
    });
    bb.on('error', rejectOnce);

    req.pipe(bb);
  });
}

/**
 * Get the uploaded file Buffer for a given field name.
 * @param {ReturnType<parseMultipart>['files']} files
 * @param {string} [fieldName='file']
 * @returns {Buffer}
 */
export function getUploadedBuffer(files, fieldName = 'file') {
  const entry = files[fieldName];
  if (!entry) {
    throw new Error(`No file uploaded under field "${fieldName}"`);
  }
  return entry.buffer;
}

/**
 * Get a scalar field value from the parsed fields map.
 * @param {Record<string, string>} fields
 * @param {string} name
 * @returns {string|undefined}
 */
export function getField(fields, name) {
  const val = fields[name];
  return Array.isArray(val) ? val[0] : val;
}
