import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Allowed image MIME types. SVG is intentionally excluded — it can carry inline
 * <script> and, since uploads are publicly served, would be a stored-XSS vector.
 * Shared so the client can pre-check before requesting a presign and the server
 * can enforce the same list.
 */
export const IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export const isAllowedImageType = (type: string): type is ImageContentType =>
  (IMAGE_CONTENT_TYPES as readonly string[]).includes(type);

export const IMAGE_TYPE_MESSAGE = 'Only PNG, JPEG, GIF, WebP, or AVIF images are allowed';

export const presignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().refine(isAllowedImageType, IMAGE_TYPE_MESSAGE),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const presignResponseSchema = z.object({
  /** Presigned PUT URL the browser uploads the raw file body to. */
  uploadUrl: z.string().url(),
  /** Permanent public URL used as the <img src> after upload. */
  publicUrl: z.string().url(),
  /** Object key in the bucket. */
  key: z.string(),
});
export type PresignResponse = z.infer<typeof presignResponseSchema>;
