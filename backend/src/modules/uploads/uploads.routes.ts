import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { createRouter } from '../../lib/router';
import { badRequest } from '../../lib/errors';
import { randomToken } from '../../lib/http';
import { env } from '../../config';

const { router, define } = createRouter('/uploads');

fs.mkdirSync(env.uploadsDir, { recursive: true });

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomToken(6)}${ALLOWED.get(file.mimetype) ?? path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(badRequest('Дозволені лише зображення JPG, PNG або WebP', 'INVALID_FILE_TYPE'));
    cb(null, true);
  },
});

define({
  method: 'post',
  path: '/',
  summary: 'Завантажити зображення страви (multipart/form-data, поле file, до 5 МБ)',
  tags: ['Uploads'],
  roles: ['ADMIN'],
  status: 201,
  middleware: [upload.single('file')],
  handler: ({ req }) => {
    if (!req.file) throw badRequest('Файл не передано (поле file)', 'NO_FILE');
    return { url: `/uploads/${req.file.filename}`, size: req.file.size, mimeType: req.file.mimetype };
  },
});

export default router;
