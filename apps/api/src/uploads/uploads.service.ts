import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IMAGE_TYPE_MESSAGE,
  MAX_UPLOAD_BYTES,
  isAllowedImageType,
  type UploadResponse,
} from '@blockpress/shared';

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * On-disk image storage (replaces S3). Files are saved under UPLOADS_DIR with a
 * unique, content-type-derived name (`<year>/<uuid>.<ext>`) and served back as
 * static assets at `/uploads/*` (see main.ts). The returned `url` is absolute so
 * both the web app and the mobile reader can load it directly.
 */
@Injectable()
export class UploadsService {
  /** Where files live on disk. Mounted as a persistent volume in production. */
  readonly dir = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
  private readonly publicBase = (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
  );

  async save(file?: Express.Multer.File): Promise<UploadResponse> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!isAllowedImageType(file.mimetype)) throw new BadRequestException(IMAGE_TYPE_MESSAGE);
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Image is too large (max 15MB)');

    const ext = EXT_BY_TYPE[file.mimetype] ?? 'bin';
    const key = `${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const dest = join(this.dir, key);
    await mkdir(join(this.dir, String(new Date().getFullYear())), { recursive: true });
    await writeFile(dest, file.buffer);

    return { url: `${this.publicBase}/uploads/${key}`, key };
  }
}
