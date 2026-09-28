import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Move, Plus, Printer, RefreshCw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, Field, Input, SectionTitle, Select, Skeleton, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { FloorPlan } from '@/components/domain/FloorPlan';
import { LogoMark } from '@/components/domain/Logo';
import { api, errorMessage } from '@/lib/api';
import { ZONES } from '@/lib/constants';
import type { Table, TableShape, TableZone } from '@/lib/types';

export default function TablesAdmin() {
  const qc = useQueryClient();
  const tables = useQuery({ queryKey: ['tables-admin'], queryFn: () => api.get<Table[]>('/tables', { includeInactive: true }) });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<Table | null>(null);
  const selected = tables.data?.find((t) => t.id === selectedId) ?? null;
  const invalidate = () => ['tables-admin', 'tables-live', 'booking-tables'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const move = useMutation({
    mutationFn: ({ id, posX, posY }: { id: number; posX: number; posY: number }) => api.patch(`/tables/${id}`, { posX, posY }),
    onMutate: ({ id, posX, posY }) => {
      qc.setQueryData<Table[]>(['tables-admin'], (old) => old?.map((t) => (t.id === id ? { ...t, posX, posY } : t)));
    },
    onSuccess: () => {
      toast.success('Позицію столика збережено');
      invalidate();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Адміністрування"
        title="Столики та QR-коди"
        subtitle="Перетягуйте столики на плані — позиції одразу оновляться у бронюванні та в залі."
        action={
          <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Додати столик
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-xs text-ink-400">
            <Move className="size-3.5 text-gold-300" /> Режим редагування: перетягніть столик мишею
          </div>
          {tables.data ? (
            <FloorPlan
              tables={tables.data.filter((t) => t.isActive !== false)}
              editable
              visual={(t) => ({ tone: t.id === selectedId ? 'selected' : 'free', sublabel: `${t.seats} місць` })}
              onSelect={(t) => setSelectedId(t.id)}
              onMove={(t, posX, posY) => move.mutate({ id: t.id, posX, posY })}
            />
          ) : (
            <Skeleton className="aspect-[16/10]" />
          )}
        </Card>
        <div className="space-y-4">
          {selected ? <TableEditor key={selected.id} table={selected} onSaved={invalidate} onQr={() => setQrFor(selected)} /> : <Card className="p-6 text-sm text-ink-300">Оберіть столик на плані для редагування.</Card>}
          <Card className="p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-400">Усі столики</div>
            <div className="grid grid-cols-4 gap-2">
              {tables.data?.map((t) => (
                <button key={t.id} onClick={() => setSelectedId(t.id)} className={`rounded-xl border px-2 py-2 text-center text-sm transition ${t.id === selectedId ? 'border-gold-300/60 bg-gold-400/15 text-gold-100' : 'border-white/8 text-ink-200 hover:border-white/20'} ${t.isActive === false ? 'opacity-40' : ''}`}>
                  №{t.number}
                  <div className="text-[10px] text-ink-500">{t.seats} міс.</div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <CreateTable open={creating} onClose={() => setCreating(false)} onSaved={invalidate} />
      <QrPrint table={qrFor} onClose={() => setQrFor(null)} />
    </div>
  );
}

function TableEditor({ table, onSaved, onQr }: { table: Table; onSaved: () => void; onQr: () => void }) {
  const [f, setF] = useState({ number: table.number, seats: table.seats, zone: table.zone, shape: table.shape, description: table.description ?? '', isActive: table.isActive !== false });
  const save = useMutation({
    mutationFn: () => api.patch(`/tables/${table.id}`, { ...f, description: f.description || null }),
    onSuccess: () => {
      toast.success('Столик оновлено');
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.del<{ deactivated?: boolean }>(`/tables/${table.id}`),
    onSuccess: (r) => {
      toast.success(r.deactivated ? 'Столик деактивовано (є історія бронювань)' : 'Столик видалено');
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-2xl text-cream">Столик №{table.number}</h3>
        <Button size="sm" variant="outline" icon={<Printer className="size-4" />} onClick={onQr}>
          QR
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Номер">
          <Input type="number" value={f.number} onChange={(e) => setF((x) => ({ ...x, number: Number(e.target.value) }))} />
        </Field>
        <Field label="Місць">
          <Input type="number" min={1} max={20} value={f.seats} onChange={(e) => setF((x) => ({ ...x, seats: Number(e.target.value) }))} />
        </Field>
        <Field label="Зона">
          <Select value={f.zone} onChange={(e) => setF((x) => ({ ...x, zone: e.target.value as TableZone }))}>
            {(Object.keys(ZONES) as TableZone[]).map((z) => (
              <option key={z} value={z}>
                {ZONES[z].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Форма">
          <Select value={f.shape} onChange={(e) => setF((x) => ({ ...x, shape: e.target.value as TableShape }))}>
            <option value="ROUND">Круглий</option>
            <option value="SQUARE">Квадратний</option>
            <option value="RECT">Прямокутний</option>
          </Select>
        </Field>
        <Field label="Опис" className="col-span-2">
          <Input value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} placeholder="Біля вікна" />
        </Field>
      </div>
      <Switch checked={f.isActive} onChange={(v) => setF((x) => ({ ...x, isActive: v }))} label="Активний (доступний для бронювання)" />
      <div className="flex gap-2">
        <Button variant="gold" className="flex-1" loading={save.isPending} icon={<Save className="size-4" />} onClick={() => save.mutate()}>
          Зберегти
        </Button>
        <Button variant="danger" size="icon" loading={remove.isPending} onClick={() => confirm(`Видалити столик №${table.number}?`) && remove.mutate()} aria-label="Видалити">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

function CreateTable({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ number: 15, seats: 4, zone: 'HALL' as TableZone, shape: 'SQUARE' as TableShape });
  useEffect(() => {
    if (!open) return;
    api.get<Table[]>('/tables', { includeInactive: true }).then((t) => setF((x) => ({ ...x, number: Math.max(0, ...t.map((y) => y.number)) + 1 })));
  }, [open]);
  const create = useMutation({
    mutationFn: () => api.post('/tables', { ...f, posX: 50, posY: 30 }),
    onSuccess: () => {
      toast.success('Столик додано — перетягніть його на потрібне місце');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Новий столик" footer={<div className="flex justify-end"><Button variant="gold" loading={create.isPending} onClick={() => create.mutate()}>Додати</Button></div>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Номер">
          <Input type="number" value={f.number} onChange={(e) => setF((x) => ({ ...x, number: Number(e.target.value) }))} />
        </Field>
        <Field label="Місць">
          <Input type="number" value={f.seats} onChange={(e) => setF((x) => ({ ...x, seats: Number(e.target.value) }))} />
        </Field>
        <Field label="Зона">
          <Select value={f.zone} onChange={(e) => setF((x) => ({ ...x, zone: e.target.value as TableZone }))}>
            {(Object.keys(ZONES) as TableZone[]).map((z) => (
              <option key={z} value={z}>
                {ZONES[z].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Форма">
          <Select value={f.shape} onChange={(e) => setF((x) => ({ ...x, shape: e.target.value as TableShape }))}>
            <option value="ROUND">Круглий</option>
            <option value="SQUARE">Квадратний</option>
            <option value="RECT">Прямокутний</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function QrPrint({ table, onClose }: { table: Table | null; onClose: () => void }) {
  const qc = useQueryClient();
  const qr = useQuery({ queryKey: ['table-qr', table?.id], queryFn: () => api.get<{ payload: string }>(`/tables/${table!.id}/qr`, { format: 'json' }), enabled: Boolean(table) });
  const rotate = useMutation({
    mutationFn: () => api.post(`/tables/${table!.id}/qr/rotate`),
    onSuccess: () => {
      toast.success('QR-код перевипущено, старий більше не діє');
      qc.invalidateQueries({ queryKey: ['table-qr'] });
    },
  });
  return (
    <Modal open={Boolean(table)} onClose={onClose} size="sm" title={`QR-код столика №${table?.number}`} subtitle="Роздрукуйте й поставте на столик — гості скануватимуть його для check-in та замовлення.">
      {qr.data && table && (
        <div>
          <div id="qr-print" className="mx-auto w-fit rounded-3xl bg-cream p-6 text-center text-ink-950">
            <div className="flex items-center justify-center gap-2">
              <LogoMark className="size-7" />
              <span className="font-display text-lg">Smart Restaurant</span>
            </div>
            <QRCodeSVG value={qr.data.payload} size={220} bgColor="#f5f0e8" fgColor="#0d0d11" className="mx-auto mt-4" />
            <div className="mt-3 font-display text-3xl">Столик №{table.number}</div>
            <div className="text-xs text-ink-600">Відскануйте в застосунку, щоб замовити</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button
              variant="gold"
              icon={<Printer className="size-4" />}
              onClick={() => {
                const w = window.open('', '_blank', 'width=480,height=640');
                if (!w) return;
                w.document.write(`<html><head><title>QR №${table.number}</title></head><body style="display:grid;place-items:center;height:100vh;margin:0;font-family:serif">${document.getElementById('qr-print')!.outerHTML}</body></html>`);
                w.document.close();
                w.focus();
                w.print();
              }}
            >
              Друк
            </Button>
            <Button variant="glass" icon={<RefreshCw className="size-4" />} loading={rotate.isPending} onClick={() => rotate.mutate()}>
              Перевипустити
            </Button>
          </div>
          <p className="mt-3 break-all text-center font-mono text-[10px] text-ink-500">{qr.data.payload}</p>
        </div>
      )}
    </Modal>
  );
}
