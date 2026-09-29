import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../lib/auth';
import { colors } from '../theme';
import { TabBar } from './TabBar';
import type { KitchenTabParamList, RootStackParamList, StaffTabParamList, TabParamList } from './types';
import { LoginScreen, RegisterScreen, WelcomeScreen } from '../screens/AuthScreens';
import { HomeScreen } from '../screens/HomeScreen';
import { CartScreen, DishScreen, MenuScreen } from '../screens/MenuScreens';
import { BookingScreen } from '../screens/BookingScreen';
import { OrderScreen, ReservationScreen, VisitsScreen } from '../screens/VisitScreens';
import { PaymentScreen, ReviewScreen } from '../screens/PaymentScreens';
import { ScanScreen } from '../screens/ScanScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { FloorScreen, ShiftScreen, StaffOrdersScreen, StaffReservationsScreen } from '../screens/staff/StaffScreens';
import { StaffScanScreen } from '../screens/staff/StaffScanScreen';
import { KitchenScreen, StopListScreen } from '../screens/staff/KitchenScreens';
import { AnalyticsScreen, UsersScreen } from '../screens/staff/AdminScreens';
import { isoDay } from '../lib/format';
import { useKitchenOrders, useStaffOrders, useStaffReservations } from '../lib/staff';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const StaffTab = createBottomTabNavigator<StaffTabParamList>();
const KitchenTab = createBottomTabNavigator<KitchenTabParamList>();

const theme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.gold, text: colors.text, border: colors.border },
};

function EmptyScreen() {
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Menu" component={MenuScreen} />
      <Tab.Screen name="ScanTab" component={EmptyScreen} />
      <Tab.Screen name="Visits" component={VisitsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const tabOptions = { headerShown: false, sceneStyle: { backgroundColor: colors.bg } } as const;

/** Офіціант / хостес і адміністратор: зміна, живий зал, сканер гостей, бронювання, замовлення. */
function StaffTabs() {
  const orders = useStaffOrders({ status: 'NEW,READY' });
  const pending = useStaffReservations({ date: isoDay(), status: 'PENDING' });
  const badges = { StaffOrders: orders.data?.length ?? 0, StaffReservations: pending.data?.length ?? 0 };
  return (
    <StaffTab.Navigator tabBar={(props) => <TabBar {...props} badges={badges} />} screenOptions={tabOptions}>
      <StaffTab.Screen name="Shift" component={ShiftScreen} />
      <StaffTab.Screen name="Floor" component={FloorScreen} />
      <StaffTab.Screen name="StaffScanTab" component={EmptyScreen} />
      <StaffTab.Screen name="StaffReservations" component={StaffReservationsScreen} />
      <StaffTab.Screen name="StaffOrders" component={StaffOrdersScreen} />
    </StaffTab.Navigator>
  );
}

function KitchenBoard() {
  return <KitchenScreen embedded />;
}
function KitchenStopList() {
  return <StopListScreen embedded />;
}
function KitchenView() {
  return <KitchenScreen embedded={false} />;
}
function StopList() {
  return <StopListScreen />;
}

/** Кухар: kitchen display, стоп-лист, профіль. */
function KitchenTabs() {
  const { data } = useKitchenOrders();
  const badges = { KitchenBoard: (data ?? []).filter((o) => o.status === 'CONFIRMED').length };
  return (
    <KitchenTab.Navigator tabBar={(props) => <TabBar {...props} badges={badges} />} screenOptions={tabOptions}>
      <KitchenTab.Screen name="KitchenBoard" component={KitchenBoard} />
      <KitchenTab.Screen name="StopListTab" component={KitchenStopList} />
      <KitchenTab.Screen name="KitchenProfile" component={ProfileScreen} />
    </KitchenTab.Navigator>
  );
}

export function RootNavigator() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        {!user ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.role === 'KITCHEN' ? (
          <>
            <Stack.Screen name="KitchenTabs" component={KitchenTabs} options={{ animation: 'fade' }} />
            <Stack.Screen name="StaffProfile" component={ProfileScreen} />
          </>
        ) : user.role === 'STAFF' || user.role === 'ADMIN' ? (
          <>
            <Stack.Screen name="StaffTabs" component={StaffTabs} options={{ animation: 'fade' }} />
            <Stack.Screen name="StaffScan" component={StaffScanScreen} options={{ animation: 'fade_from_bottom', presentation: 'fullScreenModal' }} />
            <Stack.Screen name="StaffProfile" component={ProfileScreen} />
            <Stack.Screen name="KitchenView" component={KitchenView} />
            <Stack.Screen name="StopList" component={StopList} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="Users" component={UsersScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ animation: 'fade' }} />
            <Stack.Screen name="Booking" component={BookingScreen} />
            <Stack.Screen name="Reservation" component={ReservationScreen} />
            <Stack.Screen name="Order" component={OrderScreen} />
            <Stack.Screen name="Cart" component={CartScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Payment" component={PaymentScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Review" component={ReviewScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Dish" component={DishScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: 'fade_from_bottom', presentation: 'fullScreenModal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
