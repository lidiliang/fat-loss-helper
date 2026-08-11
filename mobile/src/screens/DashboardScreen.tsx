import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Header, PrimaryButton, ProgressBar, Screen, SectionTitle } from '../components/ui';
import { FATTY_LIVER_LEVELS, MEAL_LABELS } from '../data/seed';
import { calculateGoals, dateKey, getMealRecommendation, getSaturatedFatLimit } from '../lib/calculations';
import { useApp } from '../context/AppContext';
import { MealType, RootTab } from '../types';
import { useColors } from '../theme';

export function DashboardScreen({ onNavigate }: { onNavigate: (tab: RootTab) => void }) {
  const colors = useColors();
  const { profile, meals, exercises, summary, selectedDate, reminders } = useApp();
  if (!profile) return null;

  const plannedMealTypes: MealType[] = reminders?.snack.trim()
    ? ['breakfast', 'lunch', 'dinner', 'snack']
    : ['breakfast', 'lunch', 'dinner'];
  const mealCount = new Set(meals.filter(item => plannedMealTypes.includes(item.mealType)).map(item => item.mealType)).size;
  const recommendation = getMealRecommendation(profile, summary, mealCount, plannedMealTypes.length);
  const goalComparison = calculateGoals({
    gender: profile.gender,
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    weeklyLossKg: profile.weeklyLossKg,
    fattyLiverLevel: profile.fattyLiverLevel,
  });
  const remaining = Math.max(0, profile.calorieGoal - summary.calories);
  const todayLabel = selectedDate === dateKey() ? '今天' : selectedDate;

  return (
    <Screen>
      <Header
        eyebrow="轻脂管家 · 今日"
        title={`你好，${profile.name}`}
        subtitle={`${todayLabel}也不用追求完美，完成一次真实记录就很好。`}
        right={<View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 23 }}>🌿</Text></View>}
      />

      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>今日剩余预算</Text>
          <Text style={styles.heroNumber}>{remaining}<Text style={styles.heroUnit}> kcal</Text></Text>
          <Text style={styles.heroMeta}>已摄入 {Math.round(summary.calories)} · 运动消耗 {Math.round(summary.burned)}</Text>
        </View>
        <View style={styles.ring}>
          <Text style={styles.ringNumber}>{Math.round(Math.min(100, summary.calories / profile.calorieGoal * 100))}%</Text>
          <Text style={styles.ringLabel}>摄入进度</Text>
        </View>
      </View>

      <View style={styles.macroGrid}>
        <MacroCard label="蛋白质" value={summary.protein} goal={profile.proteinGoal} unit="g" color={colors.primary} />
        <MacroCard label="碳水" value={summary.carb} goal={profile.carbGoal} unit="g" color={colors.blue} />
        <MacroCard label="脂肪" value={summary.fat} goal={profile.fatGoal} unit="g" color={colors.orange} />
      </View>

      {profile.fattyLiverLevel !== 'none' ? (
        <View style={[styles.goalComparison, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.goalComparisonIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.goalComparisonTitle, { color: colors.text }]}>{FATTY_LIVER_LEVELS.find(item => item.value === profile.fattyLiverLevel)?.label}脂肪肝护肝目标已启用</Text>
            <Text style={[styles.goalComparisonText, { color: colors.textMuted }]}>普通脂肪 {goalComparison.standardFatGoal}g → 推荐 {profile.fatGoal}g；蛋白质 {goalComparison.standardProteinGoal}g → {profile.proteinGoal}g</Text>
          </View>
        </View>
      ) : null}

      <Card style={{ gap: 14, backgroundColor: colors.primarySoft }}>
        <View style={styles.recommendTitle}>
          <View style={[styles.recommendIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.recommendEyebrow, { color: colors.primaryDark }]}>下一餐建议</Text>
            <Text style={[styles.recommendBudget, { color: colors.text }]}>≤ {recommendation.calories} kcal · 蛋白质约 {recommendation.protein}g</Text>
          </View>
        </View>
        <Text style={[styles.recommendText, { color: colors.text }]}>{recommendation.message}</Text>
        <Text style={[styles.limit, { color: colors.textMuted }]}>建议脂肪不超过 {recommendation.fat}g</Text>
        <View style={[styles.liverHint, { backgroundColor: colors.surface }]}>
          <Ionicons name="leaf-outline" size={15} color={colors.primary} />
          <Text style={[styles.liverHintText, { color: colors.textMuted }]}>饱和脂肪建议 ≤ {getSaturatedFatLimit(profile.fatGoal)}g/天；少用猪油、黄油和肥肉，优先鱼类、少量坚果及植物油。</Text>
        </View>
      </Card>

      <SectionTitle title="今日记录" />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {meals.length === 0 && exercises.length === 0 ? (
          <View style={styles.noRecords}>
            <Text style={{ fontSize: 28 }}>🥣</Text>
            <Text style={[styles.noRecordTitle, { color: colors.text }]}>还没有记录</Text>
            <Text style={[styles.noRecordDetail, { color: colors.textMuted }]}>从第一口开始记录，不需要等到“完美的一餐”。</Text>
          </View>
        ) : (
          <>
            {(Object.keys(MEAL_LABELS) as Array<keyof typeof MEAL_LABELS>).map(type => {
              const items = meals.filter(item => item.mealType === type);
              if (!items.length) return null;
              const calories = items.reduce((sum, item) => sum + item.calories, 0);
              return (
                <View key={type} style={[styles.recordRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.recordIcon, { backgroundColor: colors.surfaceMuted }]}><Text>{type === 'breakfast' ? '☀️' : type === 'lunch' ? '🍚' : type === 'dinner' ? '🌙' : '🍎'}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recordName, { color: colors.text }]}>{MEAL_LABELS[type]}</Text>
                    <Text numberOfLines={1} style={[styles.recordFoods, { color: colors.textMuted }]}>{items.map(item => item.foodName).join('、')}</Text>
                  </View>
                  <Text style={[styles.recordCalories, { color: colors.text }]}>{Math.round(calories)} kcal</Text>
                </View>
              );
            })}
            {exercises.map(item => (
              <View key={item.id} style={[styles.recordRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.recordIcon, { backgroundColor: colors.primarySoft }]}><Text>🏃</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recordName, { color: colors.text }]}>{item.exerciseType}</Text>
                  <Text style={[styles.recordFoods, { color: colors.textMuted }]}>{item.durationMin} 分钟</Text>
                </View>
                <Text style={[styles.recordCalories, { color: colors.primary }]}>−{Math.round(item.caloriesBurned)} kcal</Text>
              </View>
            ))}
          </>
        )}
      </Card>
      <PrimaryButton label="记录饮食或运动" onPress={() => onNavigate('record')} />
    </Screen>
  );
}

function MacroCard({ label, value, goal, unit, color }: { label: string; value: number; goal: number; unit: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.macroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.macroLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.macroValue, { color: colors.text }]}>{Math.round(value)}<Text style={styles.macroUnit}>{unit}</Text></Text>
      <ProgressBar value={value / goal} color={color} />
      <Text style={[styles.macroGoal, { color: colors.textMuted }]}>目标 {goal}{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  hero: { padding: 22, borderRadius: 25, flexDirection: 'row', alignItems: 'center' },
  heroLabel: { color: '#D9F1E4', fontSize: 12, fontWeight: '700' },
  heroNumber: { color: '#fff', fontSize: 42, lineHeight: 50, fontWeight: '900', letterSpacing: -1 },
  heroUnit: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  heroMeta: { color: '#D9F1E4', fontSize: 11, marginTop: 3 },
  ring: { width: 84, height: 84, borderRadius: 42, borderWidth: 8, borderColor: '#FFFFFF45', backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' },
  ringNumber: { color: '#fff', fontSize: 20, fontWeight: '900' },
  ringLabel: { color: '#D9F1E4', fontSize: 9, marginTop: 2 },
  macroGrid: { flexDirection: 'row', gap: 9 },
  macroCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 13, gap: 7 },
  macroLabel: { fontSize: 11, fontWeight: '700' },
  macroValue: { fontSize: 21, fontWeight: '900' },
  macroUnit: { fontSize: 10, fontWeight: '600' },
  macroGoal: { fontSize: 9 },
  goalComparison: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalComparisonIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goalComparisonTitle: { fontSize: 11.5, fontWeight: '800' },
  goalComparisonText: { fontSize: 9.5, lineHeight: 15, marginTop: 2 },
  recommendTitle: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  recommendIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recommendEyebrow: { fontSize: 11, fontWeight: '800' },
  recommendBudget: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  recommendText: { fontSize: 13, lineHeight: 20 },
  limit: { fontSize: 11 },
  liverHint: { borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  liverHintText: { flex: 1, fontSize: 10.5, lineHeight: 16 },
  noRecords: { padding: 30, alignItems: 'center', gap: 6 },
  noRecordTitle: { fontSize: 15, fontWeight: '800' },
  noRecordDetail: { fontSize: 12, textAlign: 'center' },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  recordIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recordName: { fontSize: 14, fontWeight: '800' },
  recordFoods: { fontSize: 11, marginTop: 3 },
  recordCalories: { fontSize: 12, fontWeight: '800' },
});
