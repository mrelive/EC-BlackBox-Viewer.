/**
 * multipart.js
 * Lightweight multipart/form-data parser using busboy.
 * Collects file contents into a Buffer in memory — no temp files.
 */

import busboy from 'busboy';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Parse a multipart request.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ files: Record<string, { buffer: Buffer, filename: string, mimeType: string }>, fields: Record<string, string> }>}
 */
export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE_BYTES } });
    const files = {};
    const fields = {};

    bb.on('file', (fieldname, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        files[fieldname] = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || 'upload',
          mimeType: info.mimeType || 'application/octet-stream',
        };
      });
      stream.on('error', reject);
    });

    bb.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    bb.on('finish', () => resolve({ files, fields }));
    bb.on('error', reject);

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
