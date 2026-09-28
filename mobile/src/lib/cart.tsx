import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Dish } from '../api/types';

export interface CartLine {
  dishId: number;
  name: string;
  price: number;
  imageUrl: string | null;
  category?: string;
  quantity: number;
  notes?: string;
}

interface CartState {
  lines: CartLine[];
  count: number;
  total: number;
  add: (d: Dish) => void;
  setQty: (dishId: number, qty: number) => void;
  setNotes: (dishId: number, notes: string) => void;
  clear: () => void;
  qtyOf: (dishId: number) => number;
}

const Ctx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const value = useMemo<CartState>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      total: lines.reduce((s, l) => s + l.quantity * l.price, 0),
      add: (d) =>
        setLines((prev) =>
          prev.some((l) => l.dishId === d.id)
            ? prev.map((l) => (l.dishId === d.id ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l))
            : [...prev, { dishId: d.id, name: d.name, price: d.price, imageUrl: d.imageUrl, category: d.category?.slug, quantity: 1 }],
        ),
      setQty: (dishId, qty) =>
        setLines((prev) => (qty <= 0 ? prev.filter((l) => l.dishId !== dishId) : prev.map((l) => (l.dishId === dishId ? { ...l, quantity: Math.min(50, qty) } : l)))),
      setNotes: (dishId, notes) => setLines((prev) => prev.map((l) => (l.dishId === dishId ? { ...l, notes } : l))),
      clear: () => setLines([]),
      qtyOf: (dishId) => lines.find((l) => l.dishId === dishId)?.quantity ?? 0,
    }),
    [lines],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart outside provider');
  return ctx;
}
