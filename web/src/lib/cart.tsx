import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Dish } from './types';

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
  add: (dish: Dish, qty?: number) => void;
  setQty: (dishId: number, qty: number) => void;
  setNotes: (dishId: number, notes: string) => void;
  remove: (dishId: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const CartContext = createContext<CartState | null>(null);
const KEY = 'sr.cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const add = useCallback((dish: Dish, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.dishId === dish.id);
      if (existing) return prev.map((l) => (l.dishId === dish.id ? { ...l, quantity: Math.min(50, l.quantity + qty) } : l));
      return [...prev, { dishId: dish.id, name: dish.name, price: dish.price, imageUrl: dish.imageUrl, category: dish.category?.slug, quantity: qty }];
    });
  }, []);

  const value = useMemo<CartState>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      total: lines.reduce((s, l) => s + l.quantity * l.price, 0),
      add,
      setQty: (dishId, qty) =>
        setLines((prev) => (qty <= 0 ? prev.filter((l) => l.dishId !== dishId) : prev.map((l) => (l.dishId === dishId ? { ...l, quantity: Math.min(50, qty) } : l)))),
      setNotes: (dishId, notes) => setLines((prev) => prev.map((l) => (l.dishId === dishId ? { ...l, notes } : l))),
      remove: (dishId) => setLines((prev) => prev.filter((l) => l.dishId !== dishId)),
      clear: () => setLines([]),
      open,
      setOpen,
    }),
    [lines, add, open],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
