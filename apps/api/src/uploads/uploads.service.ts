import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignRequest, PresignResponse } from '@blockpress/shared';

/**
 * Presigned PUT uploads. Works for BOTH MinIO (dev) and AWS S3 (prod): when
 * S3_ENDPOINT is set we point at MinIO with path-style addressing; otherwise the
 * client uses AWS defaults (virtual-hosted). Credentials never reach the browser —
 * the client only PUTs the file body to the signed URL, then uses the public URL.
 */
@Injectable()
export class UploadsService {
  private readonly client: S3Client;
  private readonly bucket = process.env.S3_BUCKET ?? 'blockpress';
  private readonly publicBase = (process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
      ...(endpoint
        ? { endpoint, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' }
        : {}),
    });
  }

  async presign(req: PresignRequest): Promise<PresignResponse> {
    const ext = req.filename.includes('.') ? req.filename.split('.').pop() : 'bin';
    const key = `uploads/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: req.contentType,
    });
    // Sign content-type so the browser PUT must send the identical header.
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 300,
      signableHeaders: new Set(['content-type']),
    });
    const publicUrl = `${this.publicBase}/${key}`;
    return { uploadUrl, publicUrl, key };
  }
}
