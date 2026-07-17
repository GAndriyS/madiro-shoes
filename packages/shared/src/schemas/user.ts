import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(64);
const loginSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9._-]+$/i, 'Лише латинські літери, цифри та . _ -');
const passwordSchema = z.string().min(6).max(128);

/** Seller creation (FR-D-16): the role is always seller, no choice offered. */
export const createUserSchema = z.object({
  name: nameSchema,
  login: loginSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Seller update (FR-D-17): the new password is optional. */
export const updateUserSchema = z.object({
  name: nameSchema,
  login: loginSchema,
  password: passwordSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
