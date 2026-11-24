export type Role = 'CLIENT' | 'STAFF' | 'KITCHEN' | 'ADMIN' | 'COURIER';
export type TableZone = 'HALL' | 'TERRACE' | 'VIP' | 'BAR';
export type TableShape = 'ROUND' | 'SQUARE' | 'RECT';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'NO_SHOW';
export type OrderStatus = 'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';
export type OrderType = 'DINE_IN' | 'DELIVERY';
export type OrderItemStatus = 'QUEUED' | 'COOKING' | 'READY';

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  reservationsCount?: number;
  ordersCount?: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
  description: string | null;
  sortOrder: number;
  dishesCount: number;
}

export interface Dish {
  id: number;
  categoryId: number;
  category?: { id: number; name: string; slug: string; emoji: string | null };
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  weightGrams: number | null;
  calories: number | null;
  prepTimeMin: number;
  isAvailable: boolean;
  isArchived: boolean;
  isVegetarian: boolean;
  isSpicy: boolean;
  isChefChoice: boolean;
  tags: string[];
  allergens: string[];
  avgRating: number | null;
  reviewsCount: number;
  ordersCount: number;
  isHit: boolean;
  reviews?: { id: number; rating: number; comment: string | null; createdAt: string; author: string }[];
}

export interface Table {
  id: number;
  number: number;
  seats: number;
  zone: TableZone;
  shape: TableShape;
  posX: number;
  posY: number;
  isActive?: boolean;
  description?: string | null;
}

export interface ScoredTable {
  id: number;
  number: number;
  seats: number;
  zone: TableZone;
  score: number;
  reasons: string[];
}

export interface Slot {
  time: string;
  startAt: string;
  endAt: string;
  available: boolean;
  tablesLeft: number;
  load: number;
  inPreferredZone: boolean;
  bestTable: ScoredTable | null;
}

export interface Availability {
  date: string;
  guests: number;
  durationMin: number;
  opensAt: string;
  closesAt: string;
  isClosedForToday: boolean;
  availableCount: number;
  slots: Slot[];
}

export interface TablesAvailability {
  startAt: string;
  endAt: string;
  durationMin: number;
  recommendedTableId: number | null;
  tables: (Table & { state: 'FREE' | 'BUSY' | 'TOO_SMALL'; recommended: boolean; score: number | null; reasons: string[] })[];
}

export interface HistoryEntry {
  from: string | null;
  to: string;
  at: string;
  note: string | null;
  actor: { name: string; role: string };
}

export interface Reservation {
  id: number;
  code: string;
  status: ReservationStatus;
  statusLabel: string;
  source: 'APP' | 'WEB' | 'STAFF' | 'WALK_IN';
  guests: number;
  startAt: string;
  endAt: string;
  time: string;
  endTime: string;
  table: { id: number; number: number; seats: number; zone: TableZone };
  guestName: string | null;
  guestPhone?: string | null;
  user?: { id: number; name: string; email: string; phone: string | null };
  notes: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  ordersCount: number;
  unpaidOrdersCount: number;
  ordersTotal: number;
  qrPayload?: string;
  history?: HistoryEntry[];
  actions: {
    canCancel: boolean;
    canConfirm: boolean;
    canReject: boolean;
    canCheckIn: boolean;
    canComplete: boolean;
    canMarkNoShow: boolean;
    canOrder: boolean;
  };
}

export interface OrderItem {
  id: number;
  dishId: number;
  name: string;
  imageUrl: string | null;
  category: { name: string; emoji: string | null; slug: string };
  prepTimeMin: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  status: OrderItemStatus;
}

/** Доставка (створюється в Delivery API, у Web — лише відображення на кухні та в залі). */
export interface DeliveryInfo {
  zone: { id: number; name: string; travelMin: number };
  courier: { id: number; name: string; phone: string | null } | null;
  recipientName: string;
  phone: string;
  addressLine: string;
  comment: string | null;
  fee: number;
  paymentMethod: 'CARD' | 'CASH';
  changeFrom: number | null;
  etaAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}

export interface Order {
  id: number;
  number: number;
  type: OrderType;
  status: OrderStatus;
  statusLabel: string;
  reservationId: number | null;
  reservation: { id: number; code: string; status: ReservationStatus; guests: number } | null;
  table: { id: number; number: number; zone: TableZone } | null;
  delivery: DeliveryInfo | null;
  user: { id: number; name: string } | null;
  createdBy: { id: number; name: string; role: Role };
  items: OrderItem[];
  itemsCount: number;
  subtotal: number;
  total: number;
  notes: string | null;
  cancelReason: string | null;
  estimatedReadyAt: string | null;
  etaMinutes: number | null;
  createdAt: string;
  confirmedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  payment: {
    id: number;
    method: 'CARD' | 'CASH';
    amount: number;
    tip: number;
    cardBrand: string | null;
    cardLast4: string | null;
    providerRef: string;
    paidAt: string;
  } | null;
  pendingPaymentId: number | null;
  hasReview: boolean;
  history?: HistoryEntry[];
  actions: {
    canConfirm: boolean;
    canStart: boolean;
    canReady: boolean;
    canServe: boolean;
    canCancel: boolean;
    canPay: boolean;
    canReview: boolean;
  };
}

export interface LiveTable extends Table {
  state: 'FREE' | 'OCCUPIED' | 'RESERVED_SOON' | 'LATE';
  current: {
    reservationId: number;
    code: string;
    guestName: string | null;
    guests: number;
    since: string;
    until: string;
    untilTime: string;
    ordersTotal: number;
    activeOrders: number;
  } | null;
  next: {
    reservationId: number;
    code: string;
    status: ReservationStatus;
    guestName: string | null;
    guests: number;
    startAt: string;
    time: string;
    minutesToStart: number;
  } | null;
  signals: { newOrders: number; readyToServe: number; awaitingPayment: number };
}

export interface Recommendation {
  dish: Dish;
  score: number;
  reasons: string[];
  components: Record<string, number>;
}

export interface Payment {
  id: number;
  orderId: number;
  amount: number;
  tip: number;
  total: number;
  method: 'CARD' | 'CASH';
  status: 'PENDING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED';
  providerRef: string;
  cardBrand: string | null;
  cardLast4: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
  tableNumber?: number;
}

export interface PayResult {
  payment: Payment;
  order: Order;
  requiresAction: boolean;
  challenge?: { type: string; message: string };
}

export interface BookingConfig {
  today: string;
  slotStepMin: number;
  maxAdvanceDays: number;
  maxPartySize: number;
  minLeadMin: number;
  clientCancelDeadlineMin: number;
  checkInEarlyMin: number;
  openingHours: Record<string, { open: string; close: string }>;
  zones: { id: TableZone; label: string }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
