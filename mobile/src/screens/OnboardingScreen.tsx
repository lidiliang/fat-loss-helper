import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_LEVELS } from '../data/seed';
import { calculateGoals } from '../lib/calculations';
import { ActivityLevel, Gender, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { AppText, Card, Chip, Field, Header, PrimaryButton, Screen } from '../components/ui';
import { useColors } from '../theme';

export function OnboardingScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { saveProfile, reminders, saveReminders } = useApp();
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('30');
  const [height, setHeight] = useState('175');
  const [weight, setWeight] = useState('80');
  const [waist, setWaist] = useState('90');
  const [targetWeight, setTargetWeight] = useState('70');
  const [weeklyLoss, setWeeklyLoss] = useState('0.5');
  const [activity, setActivity] = useState<ActivityLevel>('light');
  const [saving, setSaving] = useState(false);

  const goals = useMemo(() => calculateGoals({
    gender,
    age: Number(age) || 0,
    heightCm: Number(height) || 0,
    weightKg: Number(weight) || 0,
    activityLevel: activity,
    weeklyLossKg: Number(weeklyLoss) || 0,
  }), [gender, age, height, weight, activity, weeklyLoss]);

  const submit = async () => {
    if (!user) return;
    const values = [Number(age), Number(height), Number(weight), Number(waist), Number(targetWeight)];
    if (values.some(value => !Number.isFinite(value) || value <= 0)) {
      Alert.alert('请检查信息', '年龄、身高、体重、腰围和目标体重都需要填写有效数字。');
      return;
    }
    setSaving(true);
    const profile: UserProfile = {
      ownerId: user.id,
      name: user.name,
      gender,
      age: Number(age),
      heightCm: Number(height),
      weightKg: Number(weight),
      waistCm: Number(waist),
      activityLevel: activity,
      weeklyLossKg: Number(weeklyLoss),
      targetWeightKg: Number(targetWeight),
      calorieGoal: goals.calorieGoal,
      proteinGoal: goals.proteinGoal,
      fatGoal: goals.fatGoal,
      carbGoal: goals.carbGoal,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveProfile(profile);
      if (reminders) {
        await saveReminders(reminders).catch(error => {
          Alert.alert('稍后设置提醒', error instanceof Error ? error.message : '暂时无法启用本地提醒');
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header eyebrow="第一次见面" title={`你好，${user?.name ?? ''}`} subtitle="用两分钟建立个人目标，之后都可以在设置中调整。" />
      <Card style={{ gap: 17 }}>
        <AppText style={styles.groupTitle}>基础信息</AppText>
        <View style={styles.row}>
          <Chip label="男性" selected={gender === 'male'} onPress={() => setGender('male')} />
          <Chip label="女性" selected={gender === 'female'} onPress={() => setGender('female')} />
        </View>
        <View style={styles.row}>
          <Field label="年龄" value={age} onChangeText={setAge} keyboardType="number-pad" suffix="岁" />
          <Field label="身高" value={height} onChangeText={setHeight} keyboardType="decimal-pad" suffix="cm" />
        </View>
        <View style={styles.row}>
          <Field label="当前体重" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix="kg" />
          <Field label="腰围" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" suffix="cm" />
        </View>
      </Card>

      <Card style={{ gap: 17 }}>
        <AppText style={styles.groupTitle}>目标与活动</AppText>
        <View style={styles.row}>
          <Field label="目标体重" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" suffix="kg" />
          <Field label="每周减重" value={weeklyLoss} onChangeText={setWeeklyLoss} keyboardType="decimal-pad" suffix="kg" />
        </View>
        <AppText muted style={styles.label}>日常活动水平</AppText>
        <View style={styles.wrap}>
          {ACTIVITY_LEVELS.map(item => (
            <Chip key={item.value} label={item.label} selected={activity === item.value} onPress={() => setActivity(item.value)} small />
          ))}
        </View>
      </Card>

      <View style={[styles.goalCard, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.goalEyebrow}>每日建议热量</Text>
          <Text style={styles.goalNumber}>{goals.calorieGoal}<Text style={styles.goalUnit}> kcal</Text></Text>
          <Text style={styles.goalMeta}>BMR {goals.bmr} · 预计总消耗 {goals.tdee}</Text>
        </View>
        <View style={styles.macroRow}>
          <Goal label="蛋白质" value={`${goals.proteinGoal}g`} />
          <Goal label="脂肪" value={`${goals.fatGoal}g`} />
          <Goal label="碳水" value={`${goals.carbGoal}g`} />
        </View>
      </View>

      <AppText muted style={styles.disclaimer}>热量下限与缺口经过安全限制；脂肪肝相关建议仅供生活方式管理参考，不替代医生或营养师的诊疗意见。</AppText>
      <PrimaryButton label="保存并进入轻脂管家" onPress={submit} loading={saving} />
    </Screen>
  );
}

function Goal({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.goalLabel}>{label}</Text>
      <Text style={styles.goalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 12 },
  wrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  label: { fontSize: 12, fontWeight: '700' },
  goalCard: { borderRadius: 24, padding: 22, gap: 20 },
  goalEyebrow: { color: '#D8F0E3', fontSize: 12, fontWeight: '700' },
  goalNumber: { color: '#fff', fontSize: 42, fontWeight: '900', marginTop: 5 },
  goalUnit: { fontSize: 15, fontWeight: '700' },
  goalMeta: { color: '#D8F0E3', fontSize: 11, marginTop: 5 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF55' },
  goalLabel: { color: '#D8F0E3', fontSize: 11 },
  goalValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  disclaimer: { fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
