import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AppText, Card, Chip, Field, Header, PrimaryButton, Screen, SectionTitle } from '../components/ui';
import { ACTIVITY_LEVELS, FATTY_LIVER_LEVELS } from '../data/seed';
import { calculateGoals } from '../lib/calculations';
import { API_URL } from '../lib/api';
import { getSyncStatus } from '../lib/database';
import {
  getReminderDiagnostics,
  REMINDER_CHANNEL_ID,
  ReminderDiagnostics,
  sendTestReminder,
} from '../lib/notifications';
import { backupNow, restoreLatestBackup } from '../lib/sync';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ActivityLevel, FattyLiverLevel, Gender, ReminderSettings } from '../types';
import { useColors } from '../theme';

export function SettingsScreen() {
  const colors = useColors();
  const { user, logout } = useAuth();
  const app = useApp();
  const profile = app.profile;
  const [profileOpen, setProfileOpen] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ dirty: number; lastBackupAt: string | null; lastError: string | null } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const reminderY = useRef(0);

  const refreshStatus = () => {
    if (user) getSyncStatus(user.id).then(setSyncStatus).catch(() => undefined);
  };
  useEffect(refreshStatus, [user]);

  const performBackup = async () => {
    setBackupLoading(true);
    try {
      await backupNow(true);
      refreshStatus();
      Alert.alert('备份完成', '当前账号的数据已安全备份到服务端。');
    } catch (error) {
      Alert.alert('备份失败', error instanceof Error ? error.message : '请检查网络和服务端状态');
    } finally { setBackupLoading(false); }
  };

  const confirmRestore = () => Alert.alert(
    '从云端恢复？',
    '恢复会用此账号最近一次云端备份替换本机当前数据。建议先执行一次立即备份。',
    [
      { text: '取消', style: 'cancel' },
      { text: '确认恢复', style: 'destructive', onPress: async () => {
        setRestoreLoading(true);
        try {
          await restoreLatestBackup();
          await app.refresh();
          refreshStatus();
          Alert.alert('恢复完成', '已载入最近一次云端备份。');
        } catch (error) {
          Alert.alert('恢复失败', error instanceof Error ? error.message : '请稍后重试');
        } finally { setRestoreLoading(false); }
      } },
    ],
  );

  const scrollReminderToTop = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, reminderY.current), animated: true }), 100);
  };

  if (!profile || !app.reminders || !user) return null;
  const lastBackup = syncStatus?.lastBackupAt ? new Date(syncStatus.lastBackupAt).toLocaleString('zh-CN') : '尚未完成备份';

  return (
    <Screen scrollRef={scrollRef}>
      <Header eyebrow="我的" title="设置与数据" subtitle="目标、提醒和备份都由你掌控。" />

      <Card style={styles.accountCard}>
        <View style={[styles.accountAvatar, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 24 }}>🌿</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.accountName, { color: colors.text }]}>{profile.name}</Text>
          <Text style={[styles.accountEmail, { color: colors.textMuted }]}>{user.email}</Text>
        </View>
        <Pressable onPress={() => setProfileOpen(value => !value)}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>{profileOpen ? '收起' : '编辑档案'}</Text>
        </Pressable>
      </Card>

      {profileOpen ? <ProfileEditor onDone={() => setProfileOpen(false)} /> : (
        <View style={styles.goalTiles}>
          <GoalTile label="热量目标" value={`${profile.calorieGoal} kcal`} />
          <GoalTile label="目标体重" value={`${profile.targetWeightKg} kg`} />
          <GoalTile label="脂肪肝" value={fattyLiverLabel(profile.fattyLiverLevel)} />
        </View>
      )}

      <View style={styles.reminderSection} onLayout={event => { reminderY.current = event.nativeEvent.layout.y; }}>
        <SectionTitle title="本地提醒" />
        <ReminderEditor settings={app.reminders} onExpand={scrollReminderToTop} />
      </View>

      <SectionTitle title="数据备份" />
      <Card style={{ gap: 15 }}>
        <View style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="cloud-done-outline" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>云端账号备份</Text>
            <Text style={[styles.settingDetail, { color: colors.textMuted }]}>{syncStatus?.dirty ? '有尚未备份的本地变更' : lastBackup}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: syncStatus?.dirty ? colors.orange : colors.primary }]} />
        </View>
        {syncStatus?.lastError ? <Text style={[styles.errorBox, { color: colors.red, backgroundColor: `${colors.red}12` }]}>{syncStatus.lastError}</Text> : null}
        <View style={styles.buttonRow}>
          <View style={{ flex: 1 }}><PrimaryButton label="立即备份" onPress={performBackup} loading={backupLoading} /></View>
          <View style={{ flex: 1 }}><PrimaryButton label="从云端恢复" onPress={confirmRestore} loading={restoreLoading} secondary /></View>
        </View>
        <AppText muted style={styles.backupNote}>安卓系统会在网络、电量条件允许时约每 6 小时尝试后台备份；切换到后台时也会尝试同步。系统可能延后执行，重要变更可手动备份。</AppText>
        <View style={[styles.serverBox, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.serverLabel, { color: colors.textMuted }]}>服务地址</Text>
          <Text selectable style={[styles.serverValue, { color: colors.text }]}>{API_URL}</Text>
        </View>
      </Card>

      <SectionTitle title="显示与说明" />
      <Card style={{ gap: 14 }}>
        <View style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="moon-outline" size={20} color={colors.text} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.text }]}>深色模式</Text><Text style={[styles.settingDetail, { color: colors.textMuted }]}>自动跟随安卓系统</Text></View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <AppText muted style={styles.medicalNote}>轻脂管家提供记录、估算与生活方式建议，不进行疾病诊断。脂肪肝患者如出现不适或需调整治疗方案，请咨询医生。</AppText>
      </Card>

      <PrimaryButton label="退出当前账号" secondary onPress={() => Alert.alert('退出登录？', '本机数据会保留并继续按账号隔离。下次登录后可继续使用。', [
        { text: '取消', style: 'cancel' },
        { text: '退出', style: 'destructive', onPress: () => logout() },
      ])} />
      <AppText muted style={{ textAlign: 'center', fontSize: 10 }}>轻脂管家 v{Constants.expoConfig?.version ?? '开发版'} · com.qingzhi.fatlosshelper</AppText>
    </Screen>
  );
}

function ProfileEditor({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const app = useApp();
  const profile = app.profile!;
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [age, setAge] = useState(String(profile.age));
  const [height, setHeight] = useState(String(profile.heightCm));
  const [weight, setWeight] = useState(String(profile.weightKg));
  const [waist, setWaist] = useState(String(profile.waistCm));
  const [targetWeight, setTargetWeight] = useState(String(profile.targetWeightKg));
  const [weeklyLoss, setWeeklyLoss] = useState(String(profile.weeklyLossKg));
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel);
  const [fattyLiverLevel, setFattyLiverLevel] = useState<FattyLiverLevel>(profile.fattyLiverLevel ?? 'none');
  const [saving, setSaving] = useState(false);
  const goals = useMemo(() => calculateGoals({
    gender,
    age: Number(age),
    heightCm: Number(height),
    weightKg: Number(weight),
    activityLevel: activity,
    weeklyLossKg: Number(weeklyLoss),
    fattyLiverLevel,
  }), [gender, age, height, weight, activity, weeklyLoss, fattyLiverLevel]);
  const submit = async () => {
    if ([age, height, weight, waist, targetWeight].some(value => Number(value) <= 0)) return Alert.alert('请检查输入');
    setSaving(true);
    try {
      await app.saveProfile({
        ...profile, gender, age: Number(age), heightCm: Number(height), weightKg: Number(weight), waistCm: Number(waist),
        targetWeightKg: Number(targetWeight), weeklyLossKg: Number(weeklyLoss), activityLevel: activity, fattyLiverLevel,
        calorieGoal: goals.calorieGoal, proteinGoal: goals.proteinGoal, fatGoal: goals.fatGoal, carbGoal: goals.carbGoal,
        updatedAt: new Date().toISOString(),
      });
      onDone();
      Alert.alert('目标已更新', `新的每日目标：${goals.calorieGoal} kcal，蛋白质 ${goals.proteinGoal}g，脂肪 ${goals.fatGoal}g，碳水 ${goals.carbGoal}g。`);
    } finally { setSaving(false); }
  };
  return (
    <Card style={{ gap: 15 }}>
      <View style={styles.chipRow}><Chip label="男性" selected={gender === 'male'} onPress={() => setGender('male')} /><Chip label="女性" selected={gender === 'female'} onPress={() => setGender('female')} /></View>
      <AppText muted style={{ fontSize: 11, fontWeight: '700' }}>脂肪肝情况（以体检或医生结论为准）</AppText>
      <View style={styles.chipRow}>{FATTY_LIVER_LEVELS.map(item => <Chip key={item.value} label={item.label} selected={fattyLiverLevel === item.value} onPress={() => setFattyLiverLevel(item.value)} small />)}</View>
      <View style={styles.buttonRow}><Field label="年龄" value={age} onChangeText={setAge} keyboardType="number-pad" suffix="岁" /><Field label="身高" value={height} onChangeText={setHeight} keyboardType="decimal-pad" suffix="cm" /></View>
      <View style={styles.buttonRow}><Field label="体重" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix="kg" /><Field label="腰围" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" suffix="cm" /></View>
      <View style={styles.buttonRow}><Field label="目标体重" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" suffix="kg" /><Field label="每周减重" value={weeklyLoss} onChangeText={setWeeklyLoss} keyboardType="decimal-pad" suffix="kg" /></View>
      <AppText muted style={{ fontSize: 11, fontWeight: '700' }}>活动水平</AppText>
      <View style={styles.chipRow}>{ACTIVITY_LEVELS.map(item => <Chip key={item.value} label={item.label} selected={activity === item.value} onPress={() => setActivity(item.value)} small />)}</View>
      <View style={[styles.infoBox, { backgroundColor: colors.primarySoft, gap: 5 }]}>
        <Text style={{ color: colors.primaryDark, fontSize: 11, fontWeight: '700' }}>预览：{goals.calorieGoal} kcal · 蛋白质 {goals.proteinGoal}g · 脂肪 {goals.fatGoal}g · 碳水 {goals.carbGoal}g</Text>
        <Text style={{ color: colors.primaryDark, fontSize: 10, lineHeight: 15 }}>BMR 仍使用 Mifflin–St Jeor；脂肪肝程度只调整宏量营养比例。保存后立即更新每日目标。</Text>
      </View>
      <PrimaryButton label="重新计算并保存" onPress={submit} loading={saving} />
    </Card>
  );
}

function ReminderEditor({ settings, onExpand }: { settings: ReminderSettings; onExpand: () => void }) {
  const colors = useColors();
  const app = useApp();
  const [draft, setDraft] = useState(settings);
  const [mealAdvanceText, setMealAdvanceText] = useState(String(settings.mealAdvanceMin ?? 30));
  const [exerciseAdvanceText, setExerciseAdvanceText] = useState(String(settings.exerciseAdvanceMin ?? 60));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ReminderDiagnostics | null>(null);
  const [open, setOpen] = useState(false);
  const [reliabilityOpen, setReliabilityOpen] = useState(false);
  const refreshDiagnostics = () => getReminderDiagnostics().then(setDiagnostics).catch(() => undefined);
  useEffect(() => {
    setDraft(settings);
    setMealAdvanceText(String(settings.mealAdvanceMin ?? 30));
    setExerciseAdvanceText(String(settings.exerciseAdvanceMin ?? 60));
    void refreshDiagnostics();
  }, [settings.updatedAt]);
  const days = [{ v: 1, l: '一' }, { v: 2, l: '二' }, { v: 3, l: '三' }, { v: 4, l: '四' }, { v: 5, l: '五' }, { v: 6, l: '六' }, { v: 0, l: '日' }];
  const save = async () => {
    const timeFields = [
      { label: '早餐', value: draft.breakfast.trim() },
      { label: '午餐', value: draft.lunch.trim() },
      { label: '晚餐', value: draft.dinner.trim() },
      { label: '加餐', value: draft.snack.trim() },
      { label: '运动', value: draft.exercise.trim() },
    ];
    const invalid = timeFields.find(item => item.value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.value));
    if (invalid) return Alert.alert(`${invalid.label}时间格式不正确`, '请使用 07:30 这样的 24 小时格式，或留空关闭该项提醒。');
    const mealAdvanceMin = Number(mealAdvanceText);
    const exerciseAdvanceMin = Number(exerciseAdvanceText);
    if (![mealAdvanceMin, exerciseAdvanceMin].every(value => Number.isInteger(value) && value >= 0 && value <= 240)) {
      return Alert.alert('提前提醒时间不正确', '请填写 0–240 之间的整数；填写 0 表示到点提醒。');
    }
    setSaving(true);
    try {
      const next = {
        ...draft,
        mealAdvanceMin,
        exerciseAdvanceMin,
        breakfast: draft.breakfast.trim(),
        lunch: draft.lunch.trim(),
        dinner: draft.dinner.trim(),
        snack: draft.snack.trim(),
        exercise: draft.exercise.trim(),
        updatedAt: new Date().toISOString(),
      };
      await app.saveReminders(next);
      const status = await getReminderDiagnostics();
      setDiagnostics(status);
      Alert.alert('提醒已更新', next.enabled ? `安卓系统已登记 ${status.scheduledCount} 条定时提醒，退出 App 后仍会由系统触发。` : '所有本地提醒已关闭。');
    } catch (error) {
      Alert.alert('无法设置提醒', error instanceof Error ? error.message : '请检查系统通知权限');
    } finally { setSaving(false); }
  };
  const testReminder = async () => {
    setTesting(true);
    try {
      await sendTestReminder();
      await refreshDiagnostics();
      Alert.alert('锁屏测试已安排', '请关闭提示后立即锁屏，约 10 秒后应在锁屏页显示通知并发出声音和振动。是否自动点亮屏幕还取决于手机系统的“锁屏通知亮屏”开关。');
    } catch (error) {
      Alert.alert('测试通知失败', error instanceof Error ? error.message : '请检查系统通知权限');
    } finally { setTesting(false); }
  };
  const openNotificationChannelSettings = async () => {
    try {
      await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: 'com.qingzhi.fatlosshelper' },
        { key: 'android.provider.extra.CHANNEL_ID', value: REMINDER_CHANNEL_ID },
      ]);
    } catch {
      await Linking.openSettings();
    }
  };
  const openAlarmSettings = async () => {
    try {
      await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
    } catch {
      await Linking.openSettings();
    }
  };
  const openBatterySettings = async () => {
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {
      await Linking.openSettings();
    }
  };
  const diagnosticText = !diagnostics
    ? '正在读取安卓提醒状态…'
    : `通知权限${diagnostics.permissionGranted ? '已开启' : '未开启'} · 系统已安排 ${diagnostics.scheduledCount} 条 · 通道${diagnostics.lockscreenVisible ? '允许锁屏显示' : '已隐藏锁屏内容'} · 声音${diagnostics.soundEnabled ? '已开启' : '未开启'} · 振动${diagnostics.vibrationEnabled ? '已开启' : '未开启'}`;
  const reminderTimes: Array<[string, string]> = [
    ['早餐', draft.breakfast],
    ['午餐', draft.lunch],
    ['晚餐', draft.dinner],
    ['加餐', draft.snack],
    ['运动', draft.exercise],
  ];
  const configuredTimes = reminderTimes.filter(([, time]) => Boolean(time.trim()));
  const reminderSummary = !draft.enabled
    ? '当前关闭 · 点击展开设置'
    : configuredTimes.length
      ? `${configuredTimes.map(([label, time]) => `${label} ${time.trim()}`).join(' · ')}${diagnostics ? ` · 系统已安排 ${diagnostics.scheduledCount} 条` : ''}`
      : '已开启 · 尚未填写具体提醒时间';
  const toggleOpen = () => {
    if (open) setOpen(false);
    else {
      setOpen(true);
      onExpand();
    }
  };
  return (
    <Card style={{ gap: 11, padding: 14 }}>
      <Pressable onPress={toggleOpen} style={styles.reliabilityHeader} accessibilityLabel={`${open ? '收起' : '展开'}本地提醒设置`}>
        <View style={[styles.settingIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="notifications-outline" size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>{draft.enabled ? '提醒已开启' : '提醒已关闭'}</Text>
          <Text numberOfLines={2} style={[styles.settingDetail, { color: colors.textMuted }]}>{reminderSummary}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textMuted} />
      </Pressable>
      {open ? <>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.settingRow}>
        <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="options-outline" size={20} color={colors.text} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.text }]}>启用饮食与运动提醒</Text><Text style={[styles.settingDetail, { color: colors.textMuted }]}>餐前和运动提前量均可自定义</Text></View>
        <Switch value={draft.enabled} onValueChange={enabled => setDraft({ ...draft, enabled })} trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={draft.enabled ? colors.primary : colors.textMuted} />
      </View>
      {draft.enabled ? (
        <>
          <AppText muted style={{ fontSize: 10, lineHeight: 15 }}>只填写需要的时间，留空即关闭该项；手动填写 0 可到点提醒。</AppText>
          <View style={styles.buttonRow}>
            <Field label="餐前提前" value={mealAdvanceText} onChangeText={setMealAdvanceText} keyboardType="number-pad" suffix="分钟" />
            <Field label="运动提前" value={exerciseAdvanceText} onChangeText={setExerciseAdvanceText} keyboardType="number-pad" suffix="分钟" />
          </View>
          <View style={[styles.advancePresets, { backgroundColor: colors.surfaceMuted }]}>
            <View style={styles.advancePresetRow}>
              <Text style={[styles.advancePresetLabel, { color: colors.textMuted }]}>餐前快捷</Text>
              <View style={styles.compactChipRow}>{[15, 30, 60].map(value => <Chip key={`meal-${value}`} label={`${value}分`} small selected={mealAdvanceText === String(value)} onPress={() => setMealAdvanceText(String(value))} />)}</View>
            </View>
            <View style={styles.advancePresetRow}>
              <Text style={[styles.advancePresetLabel, { color: colors.textMuted }]}>运动快捷</Text>
              <View style={styles.compactChipRow}>{[15, 30, 60].map(value => <Chip key={`exercise-${value}`} label={`${value}分`} small selected={exerciseAdvanceText === String(value)} onPress={() => setExerciseAdvanceText(String(value))} />)}</View>
            </View>
          </View>
          <View style={styles.buttonRow}><Field label="早餐（可选）" value={draft.breakfast} placeholder="留空则不提醒" onChangeText={breakfast => setDraft({ ...draft, breakfast })} keyboardType="numbers-and-punctuation" /><Field label="午餐（可选）" value={draft.lunch} placeholder="留空则不提醒" onChangeText={lunch => setDraft({ ...draft, lunch })} keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.buttonRow}><Field label="晚餐（可选）" value={draft.dinner} placeholder="留空则不提醒" onChangeText={dinner => setDraft({ ...draft, dinner })} keyboardType="numbers-and-punctuation" /><Field label="加餐（可选）" value={draft.snack} placeholder="留空则不提醒" onChangeText={snack => setDraft({ ...draft, snack })} keyboardType="numbers-and-punctuation" /></View>
          <Field label="运动计划时间（可选）" value={draft.exercise} placeholder="留空则不提醒" onChangeText={exercise => setDraft({ ...draft, exercise })} keyboardType="numbers-and-punctuation" />
          <AppText muted style={{ fontSize: 11, fontWeight: '700' }}>运动日</AppText>
          <View style={styles.chipRow}>{days.map(day => <Chip key={day.v} label={`周${day.l}`} small selected={draft.exerciseDays.includes(day.v)} onPress={() => setDraft({ ...draft, exerciseDays: draft.exerciseDays.includes(day.v) ? draft.exerciseDays.filter(v => v !== day.v) : [...draft.exerciseDays, day.v] })} />)}</View>
        </>
      ) : null}
      <PrimaryButton label="保存提醒设置" onPress={save} loading={saving} />
      <View style={[styles.infoBox, { backgroundColor: colors.surfaceMuted, gap: 8 }]}>
        <Pressable onPress={() => setReliabilityOpen(value => !value)} style={styles.reliabilityHeader} accessibilityLabel={`${reliabilityOpen ? '收起' : '展开'}通知可靠性设置`}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>通知可靠性与系统权限</Text>
            <Text numberOfLines={2} style={{ color: diagnostics?.permissionGranted && diagnostics.channelEnabled ? colors.primary : colors.orange, fontSize: 9.5, lineHeight: 14, fontWeight: '800', marginTop: 3 }}>{diagnosticText}</Text>
          </View>
          <Ionicons name={reliabilityOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {reliabilityOpen ? <>
        <AppText muted style={{ fontSize: 10, lineHeight: 16 }}>提醒由安卓系统闹钟调度，不要求应用常驻内存。锁屏不显示时，请允许锁屏通知、精确闹钟和锁屏亮屏；部分品牌还需允许自启动。</AppText>
        <View style={styles.buttonRow}>
          <View style={{ flex: 1 }}><PrimaryButton label="测试锁屏通知" onPress={testReminder} loading={testing} compact /></View>
          <View style={{ flex: 1 }}><PrimaryButton label="锁屏/声音设置" onPress={openNotificationChannelSettings} secondary compact /></View>
        </View>
        <View style={styles.buttonRow}>
          <View style={{ flex: 1 }}><PrimaryButton label="允许精确定时" onPress={openAlarmSettings} secondary compact /></View>
          <View style={{ flex: 1 }}><PrimaryButton label="电池后台设置" onPress={openBatterySettings} secondary compact /></View>
        </View>
        </> : null}
      </View>
      </> : null}
    </Card>
  );
}

function GoalTile({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return <View style={[styles.goalTile, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.goalLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.goalValue, { color: colors.text }]}>{value}</Text></View>;
}

function fattyLiverLabel(level: FattyLiverLevel) {
  return FATTY_LIVER_LEVELS.find(item => item.value === level)?.label ?? '无';
}

const styles = StyleSheet.create({
  reminderSection: { gap: 18 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  accountAvatar: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: 17, fontWeight: '900' },
  accountEmail: { fontSize: 11, marginTop: 4 },
  goalTiles: { flexDirection: 'row', gap: 8 },
  goalTile: { flex: 1, borderWidth: 1, borderRadius: 17, padding: 15, gap: 5 },
  goalLabel: { fontSize: 10, fontWeight: '700' },
  goalValue: { fontSize: 16, fontWeight: '900' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 13, fontWeight: '800' },
  settingDetail: { fontSize: 10, marginTop: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  compactChipRow: { flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' },
  advancePresets: { borderRadius: 13, padding: 9, gap: 7 },
  advancePresetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  advancePresetLabel: { width: 58, fontSize: 10, fontWeight: '800' },
  reliabilityHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  backupNote: { fontSize: 10, lineHeight: 16 },
  serverBox: { borderRadius: 13, padding: 12, gap: 4 },
  serverLabel: { fontSize: 9, fontWeight: '700' },
  serverValue: { fontSize: 10 },
  errorBox: { padding: 11, borderRadius: 12, fontSize: 10, lineHeight: 15 },
  divider: { height: StyleSheet.hairlineWidth },
  medicalNote: { fontSize: 10, lineHeight: 17 },
  infoBox: { padding: 12, borderRadius: 13 },
});
