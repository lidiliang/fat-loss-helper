import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppProvider, useApp } from './src/context/AppContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { RootTab } from './src/types';
import { useColors } from './src/theme';
import { dateKey } from './src/lib/calculations';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppGate() {
  const { ready, user } = useAuth();
  const colors = useColors();
  if (!ready) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!user) return <AuthScreen />;
  return <AppProvider><ProfileGate /></AppProvider>;
}

function ProfileGate() {
  const colors = useColors();
  const { loading, profile } = useApp();
  if (loading) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!profile) return <OnboardingScreen />;
  return <MainApp />;
}

function MainApp() {
  const [tab, setTab] = useState<RootTab>('home');
  const { setSelectedDate } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={{ flex: 1 }}>
        {tab === 'home' ? <DashboardScreen onNavigate={setTab} /> : null}
        {tab === 'record' ? <RecordScreen /> : null}
        {tab === 'trends' ? <TrendsScreen /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TabButton tab="home" active={tab === 'home'} label="首页" icon="home-outline" activeIcon="home" onPress={next => { setSelectedDate(dateKey()); setTab(next); }} />
        <TabButton tab="record" active={tab === 'record'} label="记录" icon="add-circle-outline" activeIcon="add-circle" onPress={setTab} emphasized />
        <TabButton tab="trends" active={tab === 'trends'} label="趋势" icon="stats-chart-outline" activeIcon="stats-chart" onPress={setTab} />
        <TabButton tab="settings" active={tab === 'settings'} label="我的" icon="person-outline" activeIcon="person" onPress={setTab} />
      </View>
    </View>
  );
}

function TabButton({ tab, active, label, icon, activeIcon, onPress, emphasized }: {
  tab: RootTab; active: boolean; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap;
  onPress: (tab: RootTab) => void; emphasized?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={() => onPress(tab)} style={styles.tabButton} accessibilityRole="button" accessibilityLabel={label}>
      <View style={emphasized ? [styles.emphasized, { backgroundColor: colors.primary }] : undefined}>
        <Ionicons name={active ? activeIcon : icon} size={emphasized ? 28 : 22} color={emphasized ? '#fff' : active ? colors.primary : colors.textMuted} />
      </View>
      <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: { position: 'absolute', left: 12, right: 12, bottom: 8, minHeight: 67, borderWidth: 1, borderRadius: 23, flexDirection: 'row', paddingTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 8 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  emphasized: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: -20, shadowColor: '#1A5A3D', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  tabLabel: { fontSize: 9, fontWeight: '800' },
});
