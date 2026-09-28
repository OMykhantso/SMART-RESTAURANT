import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChefHat, LayoutDashboard, LogOut, Menu as MenuIcon, ShoppingBag, UserRound, UtensilsCrossed, X } from 'lucide-react';
import { Logo } from '@/components/domain/Logo';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/primitives';
import { useAuth, homeFor } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useCurrentVisit } from '@/lib/queries';
import { cn } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/constants';
import { CartDrawer } from '@/components/domain/CartDrawer';

const NAV = [
  { to: '/menu', label: 'Меню' },
  { to: '/booking', label: 'Бронювання' },
];

export function PublicLayout() {
  const { user, logout } = useAuth();
  const cart = useCart();
  const visit = useCurrentVisit();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const active = visit.data?.active;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh">
      <div className="app-backdrop" />
      <header className={cn('fixed inset-x-0 top-0 z-40 transition-all duration-500', scrolled ? 'py-2' : 'py-4')}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className={cn('flex items-center justify-between gap-4 rounded-2xl px-4 py-2.5 transition-all duration-500', scrolled ? 'glass-strong shadow-2xl shadow-black/40' : 'bg-transparent')}>
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('relative rounded-xl px-4 py-2 text-sm transition-colors', isActive ? 'text-gold-200' : 'text-ink-200 hover:text-cream')}>
                  {({ isActive }) => (
                    <>
                      {n.label}
                      {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-4 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent" />}
                    </>
                  )}
                </NavLink>
              ))}
              {user?.role === 'CLIENT' && (
                <NavLink to="/account" className={({ isActive }) => cn('rounded-xl px-4 py-2 text-sm transition-colors', isActive ? 'text-gold-200' : 'text-ink-200 hover:text-cream')}>
                  Мої візити
                </NavLink>
              )}
            </nav>
            <div className="flex items-center gap-2">
              {cart.count > 0 && (
                <button onClick={() => cart.setOpen(true)} className="relative grid size-10 place-items-center rounded-xl text-ink-200 transition hover:bg-white/5 hover:text-cream" aria-label="Кошик">
                  <ShoppingBag className="size-5" />
                  <span className="gold-gradient absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full text-[10px] font-bold text-ink-950">{cart.count}</span>
                </button>
              )}
              {user ? (
                <div className="relative">
                  <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-3 transition hover:bg-white/5">
                    <Avatar name={user.name} className="size-8" />
                    <span className="hidden text-sm text-ink-100 sm:block">{user.name.split(' ')[0]}</span>
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        className="glass-strong absolute right-0 top-12 w-60 overflow-hidden rounded-2xl p-1.5 shadow-2xl shadow-black/50"
                      >
                        <div className="px-3 py-2.5">
                          <div className="text-sm font-medium text-cream">{user.name}</div>
                          <div className="text-xs text-ink-400">{ROLE_LABEL[user.role]}</div>
                        </div>
                        <div className="hairline my-1" />
                        {user.role === 'CLIENT' ? (
                          <MenuLink to="/account" icon={<UserRound className="size-4" />}>Мої візити</MenuLink>
                        ) : user.role === 'KITCHEN' ? (
                          <MenuLink to="/kitchen" icon={<ChefHat className="size-4" />}>Kitchen display</MenuLink>
                        ) : (
                          <MenuLink to="/staff" icon={<LayoutDashboard className="size-4" />}>Панель керування</MenuLink>
                        )}
                        <button
                          onClick={async () => {
                            await logout();
                            navigate('/');
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-200 transition hover:bg-white/5 hover:text-rose-200"
                        >
                          <LogOut className="size-4" /> Вийти
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link to="/login" className="hidden text-sm text-ink-200 transition hover:text-cream sm:block">
                  Увійти
                </Link>
              )}
              <Button variant="gold" size="sm" className="hidden sm:inline-flex" onClick={() => navigate(user && user.role !== 'CLIENT' ? homeFor(user.role) : '/booking')} icon={<CalendarDays className="size-4" />}>
                {user && user.role !== 'CLIENT' ? 'До роботи' : 'Забронювати'}
              </Button>
              <button className="grid size-10 place-items-center rounded-xl text-ink-200 md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Меню">
                {mobileOpen ? <X className="size-5" /> : <MenuIcon className="size-5" />}
              </button>
            </div>
          </div>
          <AnimatePresence>
            {mobileOpen && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass-strong mt-2 rounded-2xl p-2 md:hidden">
                {[...NAV, ...(user?.role === 'CLIENT' ? [{ to: '/account', label: 'Мої візити' }] : []), ...(!user ? [{ to: '/login', label: 'Увійти' }] : [])].map((n) => (
                  <Link key={n.to} to={n.to} className="block rounded-xl px-4 py-3 text-ink-100 hover:bg-white/5">
                    {n.label}
                  </Link>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      {active && !location.pathname.startsWith('/order') && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <Link to="/order" className="glass-strong group flex items-center gap-3 rounded-full py-2 pl-2 pr-5 shadow-2xl shadow-black/60 ring-1 ring-gold-400/30">
            <span className="gold-gradient grid size-10 place-items-center rounded-full text-ink-950">
              <UtensilsCrossed className="size-5" />
            </span>
            <span className="text-sm">
              <span className="block font-medium text-cream">Ви за столиком №{active.table.number}</span>
              <span className="block text-xs text-gold-200/80">Замовити або переглянути рахунок →</span>
            </span>
          </Link>
        </motion.div>
      )}

      <CartDrawer />
      <Footer />
    </div>
  );
}

function MenuLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-200 transition hover:bg-white/5 hover:text-cream">
      {icon}
      {children}
    </Link>
  );
}

function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/5">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-300">
            Ресторан, у якому технології непомітні: бронювання за хвилину, check-in за QR-кодом, замовлення зі смартфона та оплата в один дотик.
          </p>
        </div>
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300/80">Години роботи</div>
          <ul className="space-y-1.5 text-sm text-ink-300">
            <li>Пн–Чт · 10:00 – 23:00</li>
            <li>Пт–Сб · 10:00 – 24:00</li>
            <li>Нд · 11:00 – 22:00</li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300/80">Контакти</div>
          <ul className="space-y-1.5 text-sm text-ink-300">
            <li>Київ, вул. Хрещатик, 1</li>
            <li>+380 44 123 45 67</li>
            <li>hello@smartrest.ua</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-6 text-center text-xs text-ink-500">© 2026 Smart Restaurant · Курсовий проєкт «Інтернет-проєкт»</div>
    </footer>
  );
}
