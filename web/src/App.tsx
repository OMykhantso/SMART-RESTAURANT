import { lazy as reactLazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { PublicLayout } from './components/layout/PublicLayout';
import { StaffLayout } from './components/layout/StaffLayout';
import { Spinner } from './components/ui/primitives';
import { homeFor, useAuth } from './lib/auth';
import { reloadOnce } from './components/ErrorBoundary';
import type { Role } from './lib/types';

/** lazy() з автоматичним перезавантаженням, якщо файл сторінки вже замінено новою збіркою. */
function lazy<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return reactLazy(() =>
    load().catch((err) => {
      if (reloadOnce()) return new Promise<{ default: T }>(() => undefined);
      throw err;
    }),
  );
}

const Landing = lazy(() => import('./pages/public/Landing'));
const MenuPage = lazy(() => import('./pages/public/Menu'));
const Booking = lazy(() => import('./pages/public/Booking'));
const Login = lazy(() => import('./pages/public/Login'));
const Register = lazy(() => import('./pages/public/Register'));
const Account = lazy(() => import('./pages/client/Account'));
const ReservationDetails = lazy(() => import('./pages/client/ReservationDetails'));
const OrderDetails = lazy(() => import('./pages/client/OrderDetails'));
const TableOrder = lazy(() => import('./pages/client/TableOrder'));
const StaffDashboard = lazy(() => import('./pages/staff/Dashboard'));
const Floor = lazy(() => import('./pages/staff/Floor'));
const StaffReservations = lazy(() => import('./pages/staff/Reservations'));
const StaffOrders = lazy(() => import('./pages/staff/Orders'));
const Scan = lazy(() => import('./pages/staff/Scan'));
const Kitchen = lazy(() => import('./pages/kitchen/Kitchen'));
const AdminMenu = lazy(() => import('./pages/admin/MenuAdmin'));
const AdminTables = lazy(() => import('./pages/admin/TablesAdmin'));
const AdminUsers = lazy(() => import('./pages/admin/UsersAdmin'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));

function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner className="size-8" />
    </div>
  );
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), [pathname]);
  return null;
}

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="booking" element={<Booking />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="account" element={<RequireRole roles={['CLIENT']}><Account /></RequireRole>} />
          <Route path="account/reservations/:id" element={<RequireRole roles={['CLIENT']}><ReservationDetails /></RequireRole>} />
          <Route path="account/orders/:id" element={<RequireRole roles={['CLIENT']}><OrderDetails /></RequireRole>} />
          <Route path="order" element={<RequireRole roles={['CLIENT']}><TableOrder /></RequireRole>} />
        </Route>

        <Route element={<RequireRole roles={['STAFF', 'ADMIN']}><StaffLayout /></RequireRole>}>
          <Route path="staff" element={<StaffDashboard />} />
          <Route path="staff/floor" element={<Floor />} />
          <Route path="staff/reservations" element={<StaffReservations />} />
          <Route path="staff/orders" element={<StaffOrders />} />
          <Route path="staff/scan" element={<Scan />} />
          <Route path="admin/analytics" element={<Analytics />} />
          <Route path="admin/menu" element={<RequireRole roles={['ADMIN']}><AdminMenu /></RequireRole>} />
          <Route path="admin/tables" element={<RequireRole roles={['ADMIN']}><AdminTables /></RequireRole>} />
          <Route path="admin/users" element={<RequireRole roles={['ADMIN']}><AdminUsers /></RequireRole>} />
        </Route>

        <Route path="kitchen" element={<RequireRole roles={['KITCHEN', 'STAFF', 'ADMIN']}><Kitchen /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
