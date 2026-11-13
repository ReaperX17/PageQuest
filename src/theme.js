import { Platform } from 'react-native';

export const COLORS = {
  primary: '#4F46E5',      // Indigo 600
  primaryDark: '#3730A3',  // Indigo 800
  primaryLight: '#EEF2FF', // Indigo 50
  secondary: '#0EA5E9',    // Sky 500
  secondaryLight: '#E0F2FE',
  success: '#10B981',      // Emerald 500
  successDark: '#065F46',
  successLight: '#D1FAE5',
  warning: '#F59E0B',      // Amber 500
  warningDark: '#92400E',
  warningLight: '#FEF3C7',
  danger: '#EF4444',       // Red 500
  dangerDark: '#991B1B',
  dangerLight: '#FEE2E2',
  background: '#F4F6FB',   // Soft cool gray/blue background
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  textPrimary: '#0F172A',  // Slate 900
  textSecondary: '#475569',// Slate 600
  textMuted: '#94A3B8'     // Slate 400
};

export const SHADOWS = {
  card: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.07,
      shadowRadius: 8
    },
    android: {
      elevation: 3
    },
    default: {
      boxShadow: '0px 3px 10px rgba(15, 23, 42, 0.06)'
    }
  })
};
