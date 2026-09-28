import QRCode from 'react-native-qrcode-svg';
import { colors } from '../theme';

/** QR-код (SVG) — показується хостес для check-in. */
export function Qr({ value, size = 180 }: { value: string; size?: number }) {
  return <QRCode value={value} size={size} color={colors.bg} backgroundColor={colors.text} quietZone={4} />;
}
