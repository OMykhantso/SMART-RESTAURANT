import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Edit3, FolderPlus, ImageUp, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, Chip, Field, Input, SectionTitle, Select, Skeleton, Switch, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { DishImage } from '@/components/domain/DishImage';
import { api, errorMessage, http, toApiError } from '@/lib/api';
import { useCategories, useDishes } from '@/lib/queries';
import { cn, money } from '@/lib/format';
import type { Category, Dish } from '@/lib/types';

export default function MenuAdmin() {
  const qc = useQueryClient();
  const [cat, setCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Dish | 'new' | null>(null);
  const [catModal, setCatModal] = useState<Category | 'new' | null>(null);
  const categories = useCategories();
  const dishes = useDishes({ categoryId: cat ?? undefined, search: search || undefined, includeArchived: true });

  const invalidate = () => ['dishes', 'categories', 'dish'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const toggle = useMutation({
    mutationFn: ({ id, isAvailable }: { id: number; isAvailable: boolean }) => api.patch(`/dishes/${id}/availability`, { isAvailable }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del<{ archived: boolean }>(`/dishes/${id}`),
    onSuccess: (r) => {
      toast.success(r.archived ? 'Страву архівовано (вона є в історії замовлень)' : 'Страву видалено');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: (id: number) => api.patch(`/dishes/${id}`, { isArchived: false }),
    onSuccess: () => {
      toast.success('Страву повернуто в меню');
      invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Адміністрування"
        title="Меню"
        subtitle={`${dishes.data?.filter((d) => !d.isArchived).length ?? 0} страв у ${categories.data?.length ?? 0} категоріях`}
        action={
          <div className="flex gap-2">
            <Button variant="glass" icon={<FolderPlus className="size-4" />} onClick={() => setCatModal('new')}>
              Категорія
            </Button>
            <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Нова страва
            </Button>
          </div>
        }
      />
      <Card className="space-y-3 p-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук у меню" icon={<Search className="size-4" />} />
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            Усі
          </Chip>
          {categories.data?.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {c.emoji} {c.name} <span className="text-ink-500">{c.dishesCount}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setCatModal(c);
                }}
                className="ml-1 text-ink-500 hover:text-gold-200"
              >
                <Edit3 className="size-3" />
              </span>
            </Chip>
          ))}
        </div>
      </Card>

      {dishes.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-ink-400">
                  <th className="px-4 py-3 font-medium">Страва</th>
                  <th className="px-4 py-3 font-medium">Категорія</th>
                  <th className="px-4 py-3 font-medium">Ціна</th>
                  <th className="px-4 py-3 font-medium">Рейтинг</th>
                  <th className="px-4 py-3 font-medium">Продажі 30д</th>
                  <th className="px-4 py-3 font-medium">Наявність</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {dishes.data?.map((d) => (
                  <tr key={d.id} className={cn('border-b border-white/[0.03] transition hover:bg-white/[0.02]', d.isArchived && 'opacity-50')}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <DishImage src={d.imageUrl} alt={d.name} category={d.category?.slug} className="size-11 shrink-0" rounded="rounded-xl" zoom={false} />
                        <div>
                          <div className="text-cream">
                            {d.name} {d.isChefChoice && <span className="text-gold-300">✦</span>}
                          </div>
                          <div className="text-xs text-ink-500">
                            {d.weightGrams ? `${d.weightGrams} г · ` : ''}
                            {d.prepTimeMin} хв{d.isArchived ? ' · в архіві' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-300">
                      {d.category?.emoji} {d.category?.name}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gold-100">{money(d.price)}</td>
                    <td className="px-4 py-2.5 text-ink-200">{d.avgRating ? `★ ${d.avgRating}` : '—'}</td>
                    <td className="px-4 py-2.5 text-ink-200">{d.ordersCount}</td>
                    <td className="px-4 py-2.5">
                      <Switch checked={d.isAvailable} disabled={d.isArchived} onChange={(v) => toggle.mutate({ id: d.id, isAvailable: v })} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {d.isArchived ? (
                          <Button size="xs" variant="outline" onClick={() => restore.mutate(d.id)}>
                            Повернути
                          </Button>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing(d)} aria-label="Редагувати">
                              <Edit3 className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8 hover:text-rose-300" onClick={() => confirm(`Видалити «${d.name}»?`) && remove.mutate(d.id)} aria-label="Видалити">
                              {d.ordersCount > 0 ? <Archive className="size-4" /> : <Trash2 className="size-4" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <DishForm dish={editing} categories={categories.data ?? []} onClose={() => setEditing(null)} onSaved={invalidate} />
      <CategoryForm category={catModal} onClose={() => setCatModal(null)} onSaved={invalidate} />
    </div>
  );
}

const EMPTY = { name: '', description: '', price: '', categoryId: 0, imageUrl: '', weightGrams: '', calories: '', prepTimeMin: '15', isVegetarian: false, isSpicy: false, isChefChoice: false, isAvailable: true, tags: '', allergens: '' };

function DishForm({ dish, categories, onClose, onSaved }: { dish: Dish | 'new' | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setErrors({});
    if (dish === 'new') setF({ ...EMPTY, categoryId: categories[0]?.id ?? 0 });
    else if (dish)
      setF({
        name: dish.name,
        description: dish.description,
        price: String(dish.price / 100),
        categoryId: dish.categoryId,
        imageUrl: dish.imageUrl ?? '',
        weightGrams: dish.weightGrams ? String(dish.weightGrams) : '',
        calories: dish.calories ? String(dish.calories) : '',
        prepTimeMin: String(dish.prepTimeMin),
        isVegetarian: dish.isVegetarian,
        isSpicy: dish.isSpicy,
        isChefChoice: dish.isChefChoice,
        isAvailable: dish.isAvailable,
        tags: dish.tags.join(', '),
        allergens: dish.allergens.join(', '),
      });
  }, [dish, categories]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name,
        description: f.description,
        price: Math.round(Number(f.price.replace(',', '.')) * 100),
        categoryId: Number(f.categoryId),
        imageUrl: f.imageUrl || null,
        weightGrams: f.weightGrams ? Number(f.weightGrams) : null,
        calories: f.calories ? Number(f.calories) : null,
        prepTimeMin: Number(f.prepTimeMin),
        isVegetarian: f.isVegetarian,
        isSpicy: f.isSpicy,
        isChefChoice: f.isChefChoice,
        isAvailable: f.isAvailable,
        tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        allergens: f.allergens.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      };
      return dish === 'new' ? api.post('/dishes', body) : api.patch(`/dishes/${(dish as Dish).id}`, body);
    },
    onSuccess: () => {
      toast.success(dish === 'new' ? 'Страву додано в меню' : 'Зміни збережено');
      onSaved();
      onClose();
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setErrors(Object.fromEntries((err.details as { field: string; message: string }[]).map((d) => [d.field, d.message])));
      }
      toast.error(errorMessage(e));
    },
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await http.post<{ url: string }>('/uploads', fd);
      setF((x) => ({ ...x, imageUrl: res.data.url }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal
      open={dish !== null}
      onClose={onClose}
      size="xl"
      title={dish === 'new' ? 'Нова страва' : 'Редагування страви'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Скасувати
          </Button>
          <Button variant="gold" loading={save.isPending} onClick={() => save.mutate()}>
            Зберегти
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <DishImage src={f.imageUrl || null} alt={f.name} category={categories.find((c) => c.id === Number(f.categoryId))?.slug} className="aspect-square w-full" rounded="rounded-3xl" zoom={false} />
          <label className={cn('flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm text-ink-200 transition hover:border-gold-400/40', uploading && 'opacity-50')}>
            <ImageUp className="size-4" /> {uploading ? 'Завантаження…' : 'Завантажити фото'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <Input value={f.imageUrl} onChange={set('imageUrl')} placeholder="або URL зображення" className="text-xs" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Назва" error={errors.name} className="sm:col-span-2">
            <Input value={f.name} onChange={set('name')} />
          </Field>
          <Field label="Категорія">
            <Select value={f.categoryId} onChange={set('categoryId')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ціна, ₴" error={errors.price}>
            <Input inputMode="decimal" value={f.price} onChange={set('price')} placeholder="245" />
          </Field>
          <Field label="Опис" error={errors.description} className="sm:col-span-2">
            <Textarea value={f.description} onChange={set('description')} className="min-h-20" />
          </Field>
          <Field label="Вага, г">
            <Input inputMode="numeric" value={f.weightGrams} onChange={set('weightGrams')} />
          </Field>
          <Field label="Калорії">
            <Input inputMode="numeric" value={f.calories} onChange={set('calories')} />
          </Field>
          <Field label="Час приготування, хв" error={errors.prepTimeMin} hint="Використовується для прогнозу готовності (ETA)">
            <Input inputMode="numeric" value={f.prepTimeMin} onChange={set('prepTimeMin')} />
          </Field>
          <Field label="Теги (через кому)">
            <Input value={f.tags} onChange={set('tags')} placeholder="хіт, українська" />
          </Field>
          <Field label="Алергени (через кому)" className="sm:col-span-2">
            <Input value={f.allergens} onChange={set('allergens')} placeholder="глютен, лактоза" />
          </Field>
          <div className="flex flex-wrap gap-5 sm:col-span-2">
            <Switch checked={f.isAvailable} onChange={(v) => setF((x) => ({ ...x, isAvailable: v }))} label="В наявності" />
            <Switch checked={f.isVegetarian} onChange={(v) => setF((x) => ({ ...x, isVegetarian: v }))} label="Вегетаріанська" />
            <Switch checked={f.isSpicy} onChange={(v) => setF((x) => ({ ...x, isSpicy: v }))} label="Гостра" />
            <Switch checked={f.isChefChoice} onChange={(v) => setF((x) => ({ ...x, isChefChoice: v }))} label="Вибір шефа" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: Category | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('10');
  useEffect(() => {
    if (category && category !== 'new') {
      setName(category.name);
      setEmoji(category.emoji ?? '');
      setDescription(category.description ?? '');
      setSortOrder(String(category.sortOrder));
    } else {
      setName('');
      setEmoji('');
      setDescription('');
      setSortOrder('20');
    }
  }, [category]);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, emoji: emoji || null, description: description || null, sortOrder: Number(sortOrder) || 0 };
      return category === 'new' ? api.post('/categories', body) : api.patch(`/categories/${(category as Category).id}`, body);
    },
    onSuccess: () => {
      toast.success('Категорію збережено');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/categories/${(category as Category).id}`),
    onSuccess: () => {
      toast.success('Категорію видалено');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={category !== null}
      onClose={onClose}
      size="sm"
      title={category === 'new' ? 'Нова категорія' : 'Категорія'}
      footer={
        <div className="flex justify-between gap-2">
          {category !== 'new' ? (
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Видалити
            </Button>
          ) : (
            <span />
          )}
          <Button variant="gold" disabled={name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>
            Зберегти
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <Field label="Емодзі">
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center text-xl" maxLength={4} />
        </Field>
        <Field label="Назва">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Опис" className="col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Порядок" className="col-span-2">
          <Input inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
