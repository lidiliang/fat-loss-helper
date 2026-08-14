import { ReactNode, RefObject } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../theme';

export function Screen({ children, scroll = true, style, scrollRef }: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const colors = useColors();
  const body = scroll ? (
    <ScrollView ref={scrollRef} contentContainerStyle={[styles.screenContent, style]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }, style]}>{children}</View>
  );
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>{body}</SafeAreaView>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function AppText({ children, style, muted = false }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean }) {
  const colors = useColors();
  return <Text style={[{ color: muted ? colors.textMuted : colors.text }, style]}>{children}</Text>;
}

export function Header({ eyebrow, title, subtitle, right, compact = false }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode; compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.headerRow, compact && styles.headerRowCompact]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[styles.eyebrow, compact && styles.eyebrowCompact, { color: colors.primary }]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, compact && styles.titleCompact, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, compact && styles.subtitleCompact, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, compact = false }: { title: string; action?: ReactNode; compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact, { color: colors.text }]}>{title}</Text>
      {action}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, loading, secondary = false, compact = false }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean; compact?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: secondary ? colors.surfaceMuted : colors.primary, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? colors.primary : colors.white} /> : (
        <Text style={[styles.buttonText, { color: secondary ? colors.primary : colors.white }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', secureTextEntry, suffix, multiline, onFocus }: {
  label?: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: KeyboardTypeOptions; secureTextEntry?: boolean; suffix?: string; multiline?: boolean; onFocus?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 7, flex: 1 }}>
      {label ? <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text> : null}
      <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          onFocus={onFocus}
          style={[styles.input, { color: colors.text }, multiline && { minHeight: 76, textAlignVertical: 'top' }]}
        />
        {suffix ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Chip({ label, selected, onPress, small = false }: { label: string; selected?: boolean; onPress: () => void; small?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && { paddingVertical: 7, paddingHorizontal: 11 },
        { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: selected ? colors.white : colors.text, fontWeight: '600', fontSize: small ? 12 : 14 }}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const colors = useColors();
  const percent = Math.min(100, Math.max(0, value * 100));
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.progressFill, { backgroundColor: color ?? colors.primary, width: `${percent}%` }]} />
    </View>
  );
}

export function EmptyState({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 32 }}>{icon}</Text>
      <AppText style={{ fontSize: 15, fontWeight: '700' }}>{title}</AppText>
      <AppText muted style={{ fontSize: 13, textAlign: 'center', lineHeight: 19 }}>{detail}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120, gap: 18 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 72 },
  headerRowCompact: { minHeight: 54 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, fontWeight: '800', marginBottom: 6 },
  eyebrowCompact: { fontSize: 10, marginBottom: 3 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  titleCompact: { fontSize: 23 },
  subtitle: { fontSize: 13, marginTop: 7, lineHeight: 19 },
  subtitleCompact: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionTitleCompact: { fontSize: 15 },
  button: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonCompact: { minHeight: 40, borderRadius: 13, paddingHorizontal: 15 },
  buttonText: { fontSize: 15, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  inputWrap: { minHeight: 51, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  empty: { paddingVertical: 30, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
});
