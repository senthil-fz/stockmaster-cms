import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Allowed image MIME types. SVG is intentionally excluded — it can carry inline
 * <script> and, since uploads are publicly served, would be a stored-XSS vector.
 * Shared so the client can pre-check before uploading and the server enforces
 * the same list on POST /uploads.
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

/**
 * Response from POST /uploads (multipart). The file is stored on the API's disk
 * under a unique name and served back statically; `url` is the absolute, permanent
 * <img src> (e.g. https://api.example.com/uploads/2025/<uuid>.png).
 */
export const uploadResponseSchema = z.object({
  /** Absolute public URL used as the <img src> / coverUrl after upload. */
  url: z.string().url(),
  /** Storage key relative to the uploads dir (e.g. "2025/<uuid>.png"). */
  key: z.string(),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
