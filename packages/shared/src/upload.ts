import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export const presignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z
    .string()
    .regex(/^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/, 'Only image uploads are allowed'),
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
