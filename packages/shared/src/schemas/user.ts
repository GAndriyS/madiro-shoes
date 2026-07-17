import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(64);
const loginSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9._-]+$/i, 'Лише латинські літери, цифри та . _ -');
const passwordSchema = z.string().min(6).max(128);

/** Створення продавця (FR-D-16): роль завжди seller, вибору немає. */
export const createUserSchema = z.object({
  name: nameSchema,
  login: loginSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Редагування продавця (FR-D-17): новий пароль — опційно. */
export const updateUserSchema = z.object({
  name: nameSchema,
  login: loginSchema,
  password: passwordSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
