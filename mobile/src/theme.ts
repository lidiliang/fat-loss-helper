import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F7F3EA',
  surface: '#FFFDFA',
  surfaceMuted: '#EEF3EC',
  primary: '#2F7D5A',
  primaryDark: '#205A40',
  primarySoft: '#DCEBDD',
  text: '#17372B',
  textMuted: '#6D7C74',
  border: '#E1E4DC',
  orange: '#D9823B',
  blue: '#4C7F9D',
  red: '#B85252',
  white: '#FFFFFF',
};

export const darkColors = {
  background: '#0F1713',
  surface: '#18231E',
  surfaceMuted: '#213129',
  primary: '#69B98E',
  primaryDark: '#8ED0AB',
  primarySoft: '#254C38',
  text: '#EAF3ED',
  textMuted: '#9DB0A5',
  border: '#30423A',
  orange: '#E7A15D',
  blue: '#75A9C5',
  red: '#E08080',
  white: '#FFFFFF',
};

export type Colors = typeof lightColors;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}
