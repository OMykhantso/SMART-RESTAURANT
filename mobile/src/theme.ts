/** Дизайн-токени мобільного застосунку (спільний бренд із Web: «Noir & Gold»). */
export const colors = {
  bg: '#08080b',
  bgElevated: '#0e0e12',
  surface: '#141419',
  surfaceHigh: '#1b1b22',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#f5f0e8',
  textSoft: '#c8c7d0',
  muted: '#9d9daa',
  faint: '#6e6e7c',
  gold: '#dcab4a',
  goldLight: '#f3d99a',
  goldDark: '#a7752c',
  goldSoft: 'rgba(220,171,74,0.12)',
  goldBorder: 'rgba(220,171,74,0.35)',
  success: '#34d399',
  successSoft: 'rgba(52,211,153,0.12)',
  warning: '#fbbf24',
  warningSoft: 'rgba(251,191,36,0.12)',
  danger: '#fb7185',
  dangerSoft: 'rgba(251,113,133,0.12)',
  info: '#7dd3fc',
  infoSoft: 'rgba(125,211,252,0.12)',
  violet: '#c4b5fd',
  violetSoft: 'rgba(196,181,253,0.12)',
  orange: '#fdba74',
  orangeSoft: 'rgba(253,186,116,0.12)',
};

export const goldGradient = ['#f7e2a8', '#dcab4a', '#a7752c'] as const;

export const fonts = {
  display: 'PlayfairDisplay_500Medium',
  displayItalic: 'PlayfairDisplay_500Medium_Italic',
  displayBold: 'PlayfairDisplay_600SemiBold',
  body: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;

export type Tone = 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'orange' | 'muted';
export const tones: Record<Tone, { fg: string; bg: string }> = {
  gold: { fg: colors.goldLight, bg: colors.goldSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  violet: { fg: colors.violet, bg: colors.violetSoft },
  orange: { fg: colors.orange, bg: colors.orangeSoft },
  muted: { fg: colors.muted, bg: 'rgba(255,255,255,0.06)' },
};
