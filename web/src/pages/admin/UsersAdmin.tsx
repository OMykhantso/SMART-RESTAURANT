import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Avatar, Badge, Card, Field, Input, SectionTitle, Segmented, Select, Skeleton, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/constants';
import { fmtDateShort } from '@/lib/format';
import type { Role, User } from '@/lib/types';

type RoleFilter = 'all' | Role;

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['users', role, search, page],
    queryFn: () => api.get<{ total: number; page: number; pageSize: number; items: User[] }>('/users', { role: role === 'all' ? undefined : role, search: search || undefined, page, pageSize: 12 }),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: Role; isActive?: boolean }) => api.patch<User>(`/users/${id}`, body),
    onSuccess: (u) => {
      toast.success(`${u.name}: зміни збережено`);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Адміністрування"
        title="Користувачі та ролі"
        subtitle="Керування доступом: ролі перевіряються на сервері для кожного запиту."
        action={
          <Button variant="gold" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
            Додати працівника
          </Button>
        }
      />
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Segmented
          size="sm"
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'Усі' },
            { value: 'CLIENT', label: 'Клієнти' },
            { value: 'STAFF', label: 'Зал' },
            { value: 'KITCHEN', label: 'Кухня' },
            { value: 'ADMIN', label: 'Адміни' },
            { value: 'COURIER', label: 'Курʼєри' },
          ]}
        />
        <div className="min-w-52 flex-1">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Імʼя, email або телефон"
            icon={<Search className="size-4" />}
          />
        </div>
      </Card>
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-ink-400">
                  <th className="px-4 py-3 font-medium">Користувач</th>
                  <th className="px-4 py-3 font-medium">Роль</th>
                  <th className="px-4 py-3 font-medium">Активність</th>
                  <th className="px-4 py-3 font-medium">Реєстрація</th>
                  <th className="px-4 py-3 font-medium">Активний</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <div>
                          <div className="text-cream">
                            {u.name} {u.id === me?.id && <Badge tone="gold" dot={false} className="ml-1">це ви</Badge>}
                          </div>
                          <div className="text-xs text-ink-400">
                            {u.email}
                            {u.phone ? ` · ${u.phone}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={u.role} disabled={u.id === me?.id} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })} className="h-9 w-44 text-sm">
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-300">
                      {u.reservationsCount ?? 0} бронювань · {u.ordersCount ?? 0} замовлень
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-400">{fmtDateShort(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Switch checked={u.isActive} disabled={u.id === me?.id} onChange={(v) => update.mutate({ id: u.id, isActive: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-sm text-ink-400">
            <span>Усього: {data?.total}</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Назад">
                <ChevronLeft className="size-4" />
              </Button>
              <span>
                {page} / {pages}
              </span>
              <Button size="icon" variant="ghost" className="size-8" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Далі">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
      <CreateUser open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateUser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', role: 'STAFF' as Role });
  const create = useMutation({
    mutationFn: () => api.post('/users', { ...f, phone: f.phone || undefined }),
    onSuccess: () => {
      toast.success('Користувача створено');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
      setF({ name: '', email: '', phone: '', password: '', role: 'STAFF' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Новий користувач" footer={<div className="flex justify-end"><Button variant="gold" loading={create.isPending} onClick={() => create.mutate()}>Створити</Button></div>}>
      <div className="space-y-3">
        <Field label="Імʼя">
          <Input value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Телефон">
          <Input value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Тимчасовий пароль" hint="Мінімум 8 символів, літера та цифра">
          <Input value={f.password} onChange={set('password')} />
        </Field>
        <Field label="Роль">
          <Select value={f.role} onChange={set('role')}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
