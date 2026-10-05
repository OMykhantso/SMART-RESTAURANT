import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Menu: undefined;
  ScanTab: undefined;
  Visits: { tab?: 'reservations' | 'orders' | 'deliveries' } | undefined;
  Profile: undefined;
};

export type StaffTabParamList = {
  Shift: undefined;
  Floor: undefined;
  StaffScanTab: undefined;
  StaffReservations: undefined;
  StaffOrders: undefined;
};

export type KitchenTabParamList = {
  KitchenBoard: undefined;
  StopListTab: undefined;
  KitchenProfile: undefined;
};

export type CourierTabParamList = {
  CourierQueue: undefined;
  CourierActive: undefined;
  CourierShift: undefined;
  CourierProfile: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Booking: undefined;
  Reservation: { id: number; justCreated?: boolean };
  Order: { id: number };
  Cart: undefined;
  Payment: { orderId: number; delivery?: boolean };
  Review: { orderId: number };
  Dish: { id: number };
  Scan: undefined;
  // доставка (Delivery API)
  Checkout: undefined;
  DeliveryOrder: { id: number; justCreated?: boolean };
  Addresses: undefined;
  AddressForm: { id?: number };
  // робочі ролі
  StaffTabs: NavigatorScreenParams<StaffTabParamList> | undefined;
  KitchenTabs: NavigatorScreenParams<KitchenTabParamList> | undefined;
  StaffScan: undefined;
  StaffProfile: undefined;
  KitchenView: undefined;
  StopList: undefined;
  Analytics: undefined;
  Users: undefined;
  Dispatch: undefined;
  Zones: undefined;
  CourierTabs: NavigatorScreenParams<CourierTabParamList> | undefined;
};

export type ScreenProps<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
