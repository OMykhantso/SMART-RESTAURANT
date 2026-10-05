import { Bike, Smartphone, Wallet, MapPinned } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';

/**
 * Курʼєр працює в мобільному застосунку (окрема система доставки — Delivery API).
 * У Web лише пояснюємо, де його робоче місце.
 */
export default function CourierInfo() {
  const { user } = useAuth();
  const steps = [
    { icon: <Smartphone className="size-5" />, title: 'Відкрийте застосунок Smart Restaurant', text: 'Увійдіть тим самим email і паролем — обліковий запис спільний для всіх систем.' },
    { icon: <Bike className="size-5" />, title: 'Беріть замовлення, поки вони готуються', text: 'Вкладка «Доступні» — замовлення, що шукають курʼєра. Забрати можна, коли кухня позначить «Готово».' },
    { icon: <MapPinned className="size-5" />, title: 'Маршрут і дзвінок клієнту — в один дотик', text: 'Адреса відкривається в картах, а клієнт бачить ваш статус наживо.' },
    { icon: <Wallet className="size-5" />, title: 'Готівка фіксується під час вручення', text: 'Після «Доставлено» сума одразу потрапляє у звіт зміни та в аналітику ресторану.' },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6">
      <div className="text-sm uppercase tracking-[0.2em] text-gold-300">Служба доставки</div>
      <h1 className="mt-3 font-display text-5xl text-cream">Вітаємо, {user?.name.split(' ')[0]}!</h1>
      <p className="mt-3 text-lg text-ink-300">Робоче місце курʼєра — у мобільному застосунку. Web-версія призначена для гостей, залу та кухні.</p>
      <Card className="mt-8 divide-y divide-white/5 p-2">
        {steps.map((s) => (
          <div key={s.title} className="flex gap-4 p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-400/12 text-gold-200">{s.icon}</div>
            <div>
              <div className="font-medium text-cream">{s.title}</div>
              <div className="mt-1 text-sm text-ink-400">{s.text}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
