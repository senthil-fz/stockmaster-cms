import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().min(1, 'Name is required').max(120),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  // Strict #rrggbb — the value flows into a CSS gradient in <Avatar>, so the format is pinned
  // here (defense-in-depth: closes that CSS sink even if a future "pick a color" feature lands).
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** ISO instant the account was suspended, or null when active. */
  suspendedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

/**
 * Body for PATCH /auth/users/:id — edit a member or toggle suspension. All fields optional:
 * send only what changes. `password` resets the temporary password; `suspended` toggles
 * the account's suspended state (true → blocked from signing in, false → reactivated).
 */
export const updateUserSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    email: z.string().email().max(254),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    suspended: z.boolean(),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Response for GET /auth/users — every account, for the Authors table. Display-only, no secrets. */
export const usersListResponseSchema = z.object({
  users: z.array(userSchema),
});
export type UsersListResponse = z.infer<typeof usersListResponseSchema>;

export const accessTokenResponseSchema = z.object({
  accessToken: z.string(),
});
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;
