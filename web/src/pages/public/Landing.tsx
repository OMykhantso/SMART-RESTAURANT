import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight,
  BellRing,
  CalendarCheck2,
  Check,
  ChefHat,
  CreditCard,
  QrCode,
  Sparkles,
  Star,
  Timer,
  UtensilsCrossed,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/primitives';
import { DishImage } from '@/components/domain/DishImage';
import { api } from '@/lib/api';
import { useDishes } from '@/lib/queries';
import { useCart } from '@/lib/cart';
import { cn, money } from '@/lib/format';

const HERO_BG = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2000&q=80';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } }),
};

export default function Landing() {
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 800], [0, 160]);
  const bgOpacity = useTransform(scrollY, [0, 600], [0.55, 0.15]);
  const reviews = useQuery({
    queryKey: ['reviews-public'],
    queryFn: () => api.get<{ average: number | null; count: number; items: { id: number; rating: number; comment: string | null; author: string; dishes: string[] }[] }>('/reviews', { limit: 9, minRating: 4 }),
  });
  const chef = useDishes({ chefChoice: true });

  return (
    <>
      {/* ─────────────── HERO ─────────────── */}
      <section className="noise relative flex min-h-[100dvh] items-center overflow-hidden pb-16 pt-32">
        <motion.div style={{ y: bgY, opacity: bgOpacity }} className="absolute inset-0 -z-10">
          <img src={HERO_BG} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </motion.div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/60 via-ink-950/70 to-ink-950" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_70%_30%,rgb(200_147_58/0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute left-[8%] top-[22%] -z-10 size-72 animate-float rounded-full bg-gold-400/10 blur-3xl" />

        <div className="mx-auto grid w-full max-w-7xl items-center gap-16 px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/[0.07] px-4 py-1.5 text-xs font-medium text-gold-200">
              <Sparkles className="size-3.5" /> Ресторан, що працює швидше за думку
            </motion.div>
            <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1} className="mt-7 font-display text-5xl font-medium leading-[1.02] tracking-tight text-cream sm:text-6xl lg:text-[5.2rem]">
              Смак, що <span className="text-gold italic">передбачає</span>
              <br /> ваші бажання
            </motion.h1>
            <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2} className="mt-7 max-w-xl text-lg leading-relaxed text-ink-200">
              Забронюйте столик за 30 секунд, відскануйте QR-код на столі — і замовляйте, стежте за приготуванням у реальному часі та оплачуйте без очікування рахунку.
            </motion.p>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-10 flex flex-wrap gap-3">
              <Button variant="gold" size="xl" onClick={() => navigate('/booking')} iconRight={<ArrowRight className="size-5" />}>
                Забронювати столик
              </Button>
              <Button variant="glass" size="xl" onClick={() => navigate('/menu')} icon={<UtensilsCrossed className="size-5" />}>
                Меню
              </Button>
            </motion.div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              <HeroStat value={reviews.data?.average ? `${reviews.data.average}★` : '4.8★'} label={`${reviews.data?.count ?? 190}+ відгуків`} />
              <HeroStat value="30 сек" label="на бронювання" />
              <HeroStat value="0 хв" label="очікування рахунку" />
            </motion.div>
          </div>
          <HeroShowcase />
        </div>
      </section>

      <Marquee />

      {/* ─────────────── HOW IT WORKS ─────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-28">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }} className="mx-auto max-w-2xl text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Повний цикл візиту</div>
          <h2 className="mt-4 font-display text-4xl tracking-tight text-cream md:text-5xl">Від бронювання до оплати — без жодної черги</h2>
          <p className="mt-4 text-ink-300">Кожен крок синхронізований між вашим смартфоном, залом і кухнею в реальному часі.</p>
        </motion.div>
        <div className="relative mt-16 grid gap-5 md:grid-cols-4">
          <div className="absolute left-[12%] right-[12%] top-11 hidden h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent md:block" />
          {[
            { icon: <CalendarCheck2 className="size-6" />, title: 'Бронювання', text: 'Алгоритм підбере ідеальний столик під кількість гостей і зону.' },
            { icon: <BellRing className="size-6" />, title: 'Підтвердження', text: 'Хостес підтверджує — ви миттєво отримуєте сповіщення.' },
            { icon: <QrCode className="size-6" />, title: 'Check-in за QR', text: 'Скануєте код на столі — і ви вже «в системі».' },
            { icon: <CreditCard className="size-6" />, title: 'Замовлення та оплата', text: 'Статус страви наживо, оплата в один дотик.' },
          ].map((s, i) => (
            <motion.div key={s.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={i}>
              <Card className="group relative h-full p-6 transition-all duration-500 hover:-translate-y-1 hover:border-gold-400/25">
                <div className="relative mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-ink-850 text-gold-300 ring-1 ring-gold-400/25 transition group-hover:shadow-[var(--shadow-glow)]">
                  {s.icon}
                  <span className="gold-gradient absolute -right-2 -top-2 grid size-6 place-items-center rounded-full text-[11px] font-bold text-ink-950">{i + 1}</span>
                </div>
                <h3 className="text-center font-display text-xl text-cream">{s.title}</h3>
                <p className="mt-2 text-center text-sm leading-relaxed text-ink-300">{s.text}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─────────────── CHEF'S CHOICE ─────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Рекомендація шефа</div>
            <h2 className="mt-3 font-display text-4xl tracking-tight text-cream md:text-5xl">Страви, заради яких повертаються</h2>
          </div>
          <Link to="/menu" className="group inline-flex items-center gap-2 text-sm text-gold-200 hover:text-gold-100">
            Усе меню <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(chef.data ?? Array.from({ length: 4 })).slice(0, 8).map((d, i) =>
            d ? <ChefCard key={d.id} dish={d} index={i} /> : <div key={i} className="skeleton h-96 rounded-3xl" />,
          )}
        </div>
      </section>

      {/* ─────────────── FEATURES BENTO ─────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <div className="grid gap-5 lg:grid-cols-3">
          <Feature className="lg:col-span-2" icon={<Wand2 className="size-5" />} title="Розумний booking engine" text="Алгоритм best-fit обирає столик так, щоб не «марнувати» великі столи й не залишати незручних проміжків у розкладі. Якщо час зайнятий — одразу запропонує найближчі альтернативи.">
            <SlotsVisual />
          </Feature>
          <Feature icon={<ChefHat className="size-5" />} title="Кухня наживо" text="Бачите, як кухар бере вашу страву в роботу, і точний прогноз готовності.">
            <EtaVisual />
          </Feature>
          <Feature icon={<Sparkles className="size-5" />} title="Персональні рекомендації" text="Підказки на основі того, що гості часто замовляють разом, вашої історії та рейтингу страв.">
            <div className="mt-5 space-y-2">
              {['Часто замовляють разом із «Стейк рібай»', 'Ви часто це замовляєте', 'Завершіть вечерю десертом'].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-gold-100">
                  <Sparkles className="size-3.5 text-gold-300" /> {t}
                </div>
              ))}
            </div>
          </Feature>
          <Feature className="lg:col-span-2" icon={<CreditCard className="size-5" />} title="Оплата без очікування" text="Безпечна оплата карткою з підтримкою 3-D Secure, чайові в один дотик та електронний чек. Номер картки ніколи не зберігається.">
            <CardVisual />
          </Feature>
        </div>
      </section>

      {/* ─────────────── REVIEWS ─────────────── */}
      {reviews.data && reviews.data.items.length > 0 && (
        <section className="relative overflow-hidden py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Гості про нас</div>
                <h2 className="mt-3 font-display text-4xl tracking-tight text-cream md:text-5xl">
                  <span className="text-gold">{reviews.data.average}</span> з 5 — середня оцінка
                </h2>
              </div>
              <div className="text-sm text-ink-300">{reviews.data.count} перевірених відгуків після оплати</div>
            </div>
            <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3">
              {reviews.data.items
                .filter((r) => r.comment)
                .slice(0, 6)
                .map((r, i) => (
                  <motion.div key={r.id} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={i % 3} className="mb-5 break-inside-avoid">
                    <Card className="p-6">
                      <div className="flex gap-0.5 text-gold-300">
                        {Array.from({ length: 5 }).map((_, k) => (
                          <Star key={k} className={cn('size-4', k < r.rating ? 'fill-current' : 'opacity-25')} />
                        ))}
                      </div>
                      <p className="mt-4 font-display text-lg leading-relaxed text-cream/90">«{r.comment}»</p>
                      <div className="mt-5 flex items-center justify-between text-sm">
                        <span className="text-ink-200">{r.author}</span>
                        <span className="truncate pl-4 text-xs text-ink-400">{r.dishes.slice(0, 2).join(' · ')}</span>
                      </div>
                    </Card>
                  </motion.div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────── CTA ─────────────── */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="noise relative overflow-hidden rounded-[2.5rem] border border-gold-400/20 p-10 text-center sm:p-16">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_50%_0%,rgb(220_171_74/0.25),transparent_70%)]" />
          <div className="absolute inset-0 -z-20 bg-ink-900" />
          <h2 className="mx-auto max-w-3xl font-display text-4xl leading-tight tracking-tight text-cream md:text-6xl">
            Ваш столик <span className="text-gold italic">вже чекає</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-ink-300">Оберіть час — решту зробить Smart Restaurant.</p>
          <Button variant="gold" size="xl" className="mt-9" onClick={() => navigate('/booking')} iconRight={<ArrowRight className="size-5" />}>
            Обрати час
          </Button>
        </div>
      </section>
    </>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl text-gold-100">{value}</div>
      <div className="mt-1 text-xs text-ink-300">{label}</div>
    </div>
  );
}

/** Композиція «живого» продукту: картка замовлення зі статусом, що змінюється, бронювання і QR. */
function HeroShowcase() {
  const steps = ['Прийнято', 'Готується', 'Готово', 'Подано'];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % steps.length), 2200);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="relative mx-auto hidden h-[560px] w-full max-w-md lg:block">
      <motion.div initial={{ opacity: 0, y: 40, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ delay: 0.3, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="glass-strong absolute left-6 top-6 w-[330px] rounded-[2rem] p-5 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-400">Замовлення #1042 · Столик №5</div>
            <div className="mt-1 font-display text-xl text-cream">Вечеря на двох</div>
          </div>
          <div className="grid size-11 place-items-center rounded-2xl bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/25">
            <ChefHat className="size-5" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {[
            ['Стейк рібай', '745 ₴', 'main'],
            ['Келих червоного вина', '2 × 165 ₴', 'cocktails'],
            ['Тірамісу', '165 ₴', 'desserts'],
          ].map(([n, p, c]) => (
            <div key={n} className="flex items-center gap-3">
              <DishImage src={null} alt={n} category={c} className="size-10" rounded="rounded-xl" />
              <div className="flex-1 text-sm text-ink-100">{n}</div>
              <div className="text-sm text-ink-300">{p}</div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-[11px] text-ink-400">
            {steps.map((s, i) => (
              <span key={s} className={cn('transition-colors', i <= step && 'text-gold-200')}>
                {s}
              </span>
            ))}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <motion.div className="gold-gradient h-full rounded-full" animate={{ width: `${((step + 1) / steps.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-300">
            <Timer className="size-3.5 text-gold-300" /> {step < 2 ? `Готовність через ~${14 - step * 6} хв` : step === 2 ? 'Офіціант уже несе ваші страви' : 'Смачного! Оплата — в один дотик'}
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.8 }} className="glass-strong absolute right-0 top-[372px] w-[260px] animate-float rounded-3xl p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
            <Check className="size-5" />
          </div>
          <div>
            <div className="text-sm font-medium text-cream">Бронювання підтверджено</div>
            <div className="text-xs text-ink-400">Сьогодні, 19:30 · 2 гостей</div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.8 }} className="glass-strong absolute bottom-0 left-0 flex w-[250px] items-center gap-4 rounded-3xl p-4 shadow-2xl shadow-black/60">
        <div className="relative grid size-16 place-items-center rounded-2xl bg-cream p-2">
          <QrCode className="size-12 text-ink-950" />
          <span className="absolute inset-x-2 top-2 h-0.5 animate-[float_2s_ease-in-out_infinite] bg-gold-500 shadow-[0_0_12px_2px_rgb(220_171_74/0.8)]" />
        </div>
        <div>
          <div className="text-sm font-medium text-cream">Check-in за QR</div>
          <div className="text-xs text-ink-400">Столик №5 · вас вже чекають</div>
        </div>
      </motion.div>
    </div>
  );
}

function Marquee() {
  const words = ['Сирники', 'Борщ з пампушками', 'Стейк рібай', 'Карбонара', 'Тірамісу', 'Апероль Шприц', 'Лосось гриль', 'Різото з білими грибами', 'Маргарита', 'Качка конфі'];
  return (
    <div className="relative overflow-hidden border-y border-white/5 bg-ink-925/60 py-5">
      <motion.div className="flex w-max gap-12 whitespace-nowrap" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}>
        {[...words, ...words].map((w, i) => (
          <span key={i} className="flex items-center gap-12 font-display text-2xl italic text-ink-300">
            {w} <span className="size-1.5 rounded-full bg-gold-400/60" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function ChefCard({ dish, index }: { dish: import('@/lib/types').Dish; index: number }) {
  const cart = useCart();
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={index % 4}>
      <Card className="group h-full overflow-hidden p-2 transition-all duration-500 hover:-translate-y-1 hover:border-gold-400/25">
        <DishImage src={dish.imageUrl} alt={dish.name} category={dish.category?.slug} className="aspect-[4/3.4] w-full" rounded="rounded-[1.4rem]" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg leading-snug text-cream">{dish.name}</h3>
            {dish.avgRating && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-gold-200">
                <Star className="size-3.5 fill-current" /> {dish.avgRating}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-ink-300">{dish.description}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-lg font-semibold text-gold-100">{money(dish.price)}</span>
            <Button size="sm" variant="outline" onClick={() => cart.add(dish)} disabled={!dish.isAvailable}>
              {dish.isAvailable ? 'У кошик' : 'Немає'}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function Feature({ icon, title, text, children, className }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className={className}>
      <Card className="relative h-full overflow-hidden p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-gold-400/[0.07] blur-3xl" />
        <div className="grid size-11 place-items-center rounded-2xl bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/25">{icon}</div>
        <h3 className="mt-5 font-display text-2xl text-cream">{title}</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-300">{text}</p>
        {children}
      </Card>
    </motion.div>
  );
}

function SlotsVisual() {
  const slots = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
  const busy = new Set(['18:30', '19:00']);
  return (
    <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-8">
      {slots.map((s) => (
        <div
          key={s}
          className={cn(
            'rounded-xl border px-2 py-3 text-center text-sm tabular-nums',
            busy.has(s) ? 'border-white/5 text-ink-500 line-through' : s === '19:30' ? 'gold-gradient border-transparent font-semibold text-ink-950' : 'border-white/10 text-ink-100',
          )}
        >
          {s}
        </div>
      ))}
      <div className="col-span-full mt-2 flex items-center gap-2 text-xs text-ink-300">
        <Wand2 className="size-3.5 text-gold-300" /> Рекомендовано: столик №3 · ідеально за кількістю місць
      </div>
    </div>
  );
}

function EtaVisual() {
  return (
    <div className="mt-6 flex items-center gap-5">
      <div className="relative grid size-24 place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
          <motion.circle cx="50" cy="50" r="44" stroke="#dcab4a" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={276} initial={{ strokeDashoffset: 276 }} whileInView={{ strokeDashoffset: 90 }} transition={{ duration: 1.8, ease: 'easeOut' }} viewport={{ once: true }} />
        </svg>
        <div className="text-center">
          <div className="font-display text-2xl text-cream">7</div>
          <div className="text-[10px] text-ink-400">хв</div>
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="text-emerald-300">✓ Прийнято</div>
        <div className="text-orange-300">● Готується</div>
        <div className="text-ink-500">○ Готово</div>
      </div>
    </div>
  );
}

function CardVisual() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-6">
      <div className="relative h-40 w-64 overflow-hidden rounded-2xl p-5 shadow-2xl" style={{ background: 'linear-gradient(135deg,#2b2418,#0f0f14 60%,#3a2815)' }}>
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-gold-400/20 blur-2xl" />
        <div className="h-7 w-10 rounded-md bg-gradient-to-br from-gold-200 to-gold-600 opacity-90" />
        <div className="mt-6 font-mono text-lg tracking-widest text-cream">•••• 4242</div>
        <div className="mt-3 flex justify-between text-[10px] uppercase tracking-wider text-ink-300">
          <span>Smart Restaurant</span>
          <span>12/29</span>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        {['Оплата за 2 секунди', '3-D Secure підтвердження', 'Чайові 5 / 10 / 15 %', 'Електронний чек'].map((t) => (
          <div key={t} className="flex items-center gap-2 text-ink-200">
            <Check className="size-4 text-gold-300" /> {t}
          </div>
        ))}
      </div>
    </div>
  );
}
