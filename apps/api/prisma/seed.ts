import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Створює єдиного адміністратора з env (ADMIN_LOGIN / ADMIN_PASSWORD / ADMIN_NAME).
// Ідемпотентний: якщо адмін уже існує — оновлює лише ім'я, пароль не чіпає
// (для скидання пароля є pnpm admin:reset-password).
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const login = process.env.ADMIN_LOGIN ?? 'admin';
  const name = process.env.ADMIN_NAME ?? 'Адміністратор';
  const password = process.env.ADMIN_PASSWORD;

  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) {
    await prisma.user.update({ where: { login }, data: { name } });
    console.log(`Адмін «${login}» вже існує — пароль не змінено.`);
    return;
  }

  if (!password) {
    throw new Error('ADMIN_PASSWORD не задано в env — неможливо створити адміністратора.');
  }

  await prisma.user.create({
    data: { login, name, role: 'ADMIN', passwordHash: await argon2.hash(password) },
  });
  console.log(`Створено адміністратора «${login}».`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
