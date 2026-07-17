import { z } from 'zod';

import { ROLES } from '../enums.js';

export const loginRequestSchema = z.object({
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  login: z.string(),
  role: z.enum(ROLES),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
