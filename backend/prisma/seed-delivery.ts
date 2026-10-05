/**
 * Ідемпотентне наповнення довідників служби доставки для ІСНУЮЧОЇ бази:
 * райони доставки, облікові записи курʼєрів і адреси демо-клієнтів.
 * Нічого не видаляє — безпечно для бази, у якій уже є дані.
 * Повний демо-набір з історією доставок створює `npm run db:seed` (очищує таблиці).
 *
 * Запуск: npx tsx prisma/seed-delivery.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DELIVERY_ZONES, USERS } from './data';

const prisma = new PrismaClient();

async function main() {
  let zones = 0;
  for (const [i, z] of DELIVERY_ZONES.entries()) {
    const exists = await prisma.deliveryZone.findUnique({ where: { name: z.name } });
    if (exists) continue;
    await prisma.deliveryZone.create({
      data: {
        name: z.name,
        description: z.description,
        fee: z.fee * 100,
        minOrder: z.minOrder * 100,
        freeFrom: z.freeFrom ? z.freeFrom * 100 : null,
        travelMin: z.travelMin,
        isActive: z.isActive ?? true,
        sortOrder: i,
      },
    });
    zones++;
  }

  let couriers = 0;
  for (const u of USERS.filter((x) => x.role === 'COURIER')) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (exists) continue;
    await prisma.user.create({ data: { email: u.email, name: u.name, phone: u.phone, role: 'COURIER', passwordHash: await bcrypt.hash(u.password, 10) } });
    couriers++;
  }

  const zone = (name: string) => prisma.deliveryZone.findUniqueOrThrow({ where: { name } });
  const demo: { email: string; addresses: { zone: string; label: string; street: string; house: string; apartment?: string; entrance?: string; floor?: string; comment?: string; isDefault?: boolean }[] }[] = [
    {
      email: 'client@smartrest.ua',
      addresses: [
        { zone: 'Печерський', label: 'Дім', street: 'вул. Мечникова', house: '12', apartment: '5', entrance: '1', floor: '2', comment: 'Домофон 5, двері зліва', isDefault: true },
        { zone: 'Шевченківський', label: 'Робота', street: 'вул. Січових Стрільців', house: '7А', apartment: '304', floor: '3', comment: 'Офіс IT-компанії, рецепція на 1 поверсі' },
      ],
    },
    { email: 'maria@smartrest.ua', addresses: [{ zone: 'Подільський', label: 'Дім', street: 'вул. Покровська', house: '24', apartment: '8', isDefault: true }] },
  ];
  let addresses = 0;
  for (const d of demo) {
    const user = await prisma.user.findUnique({ where: { email: d.email }, include: { addresses: true } });
    if (!user || user.addresses.length) continue;
    for (const a of d.addresses) {
      const { zone: zoneName, ...rest } = a;
      await prisma.address.create({ data: { ...rest, userId: user.id, zoneId: (await zone(zoneName)).id } });
      addresses++;
    }
  }
  console.log(`🛵 Доставка: районів +${zones}, курʼєрів +${couriers}, адрес +${addresses}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
