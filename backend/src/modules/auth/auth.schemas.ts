import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Пароль має містити щонайменше 8 символів')
  .max(72, 'Пароль занадто довгий')
  .regex(/[A-Za-zА-Яа-яІіЇїЄєҐґ]/, 'Пароль має містити літеру')
  .regex(/\d/, 'Пароль має містити цифру');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]{10,20}$/, 'Некоректний номер телефону');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Некоректний email')).pipe(z.string().max(254));

export const nameSchema = z.string().trim().min(2, "Ім'я занадто коротке").max(100, "Ім'я занадто довге");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введіть пароль'),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
