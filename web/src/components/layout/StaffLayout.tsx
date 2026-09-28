import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  BookOpenText,
  CalendarCheck2,
  ChefHat,
  ClipboardList,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  ScanLine,
  Table2,
  Users,
  X,
} from 'lucide-react';
import { Logo } from '@/components/domain/Logo';
import { Avatar } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import { ROLE_LABEL } from '@/lib/constants';
import { cn, fmtFullDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function StaffLayout() {
  const { user, logout } = useAuth();
  const { connected } = useRealtime();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const now = useClock();
  const today = useQuery({
    queryKey: ['today'],
    queryFn: () => api.get<{ reservations: { pending: number }; orders: { byStatus: Record<string, number> } }>('/analytics/today'),
    refetchInterval: 60_000,
  });
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const isAdmin = user?.role === 'ADMIN';
  const work: NavItem[] = [
    { to: '/staff', label: 'Огляд', icon: <LayoutDashboard className="size-[18px]" />, end: true },
    { to: '/staff/floor', label: 'План залу', icon: <LayoutGrid className="size-[18px]" /> },
    { to: '/staff/reservations', label: 'Бронювання', icon: <CalendarCheck2 className="size-[18px]" />, badge: today.data?.reservations.pending },
    { to: '/staff/orders', label: 'Замовлення', icon: <ClipboardList className="size-[18px]" />, badge: today.data?.orders.byStatus.NEW },
    { to: '/staff/scan', label: 'Сканер QR', icon: <ScanLine className="size-[18px]" /> },
    { to: '/kitchen', label: 'Kitchen display', icon: <ChefHat className="size-[18px]" /> },
  ];
  const admin: NavItem[] = [
    { to: '/admin/analytics', label: 'Аналітика', icon: <BarChart3 className="size-[18px]" /> },
    { to: '/admin/menu', label: 'Меню', icon: <BookOpenText className="size-[18px]" /> },
    { to: '/admin/tables', label: 'Столики та QR', icon: <Table2 className="size-[18px]" /> },
    { to: '/admin/users', label: 'Користувачі', icon: <Users className="size-[18px]" /> },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <Logo to="/staff" />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        <NavGroup title="Робота залу" items={work} />
        {isAdmin && <NavGroup title="Адміністрування" items={admin} />}
        {!isAdmin && <NavGroup title="Аналітика" items={[admin[0]]} />}
        <NavGroup title="Сайт" items={[{ to: '/', label: 'Відкрити сайт гостя', icon: <Globe className="size-[18px]" />, end: true }]} />
      </nav>
      <div className="m-3 rounded-2xl border border-white/6 bg-white/[0.03] p-3">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-cream">{user?.name}</div>
            <div className="text-xs text-ink-400">{user && ROLE_LABEL[user.role]}</div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="grid size-9 place-items-center rounded-xl text-ink-300 transition hover:bg-white/5 hover:text-rose-200"
            aria-label="Вийти"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <div className="app-backdrop" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r border-white/5 bg-ink-925/80 backdrop-blur-xl lg:block">{sidebar}</aside>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }} className="absolute inset-y-0 left-0 w-72 border-r border-white/5 bg-ink-925">
              {sidebar}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <div className="lg:pl-68">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <button className="grid size-10 place-items-center rounded-xl text-ink-200 hover:bg-white/5 lg:hidden" onClick={() => setOpen(true)} aria-label="Меню">
                {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
              </button>
              <div>
                <div className="text-sm text-cream">{fmtFullDate(now)}</div>
                <div className="text-xs text-ink-400">Smart Restaurant · Київ</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs sm:flex">
                <span className="relative flex size-2">
                  {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                  <span className={cn('relative inline-flex size-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-rose-400')} />
                </span>
                <span className="text-ink-300">{connected ? 'Real-time підключено' : 'Немає зʼєднання'}</span>
              </div>
              <div className="font-display text-2xl tabular-nums text-gold-200">
                {new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }).format(now)}
              </div>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">{title}</div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                isActive ? 'bg-gradient-to-r from-gold-400/15 to-transparent text-gold-100' : 'text-ink-300 hover:bg-white/[0.04] hover:text-cream',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="staff-nav" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold-300" />}
                <span className={cn('transition-colors', isActive ? 'text-gold-300' : 'text-ink-400 group-hover:text-ink-200')}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {!!item.badge && <span className="gold-gradient min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 text-ink-950">{item.badge}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
