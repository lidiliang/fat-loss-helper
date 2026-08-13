import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ReminderSettings } from '../types';

// Android keeps a channel's user-visible importance/sound policy after it is
// first created. A new id lets upgraded installs receive the audible policy.
export const REMINDER_CHANNEL_ID = 'healthy-reminders-v4';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Expo Android suppresses the heads-up banner when this is false,
    // regardless of the channel priority.
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

function parseTime(value: string, minutesBefore = 0) {
  const [rawHour, rawMinute] = value.split(':').map(Number);
  const total = (rawHour * 60 + rawMinute - minutesBefore + 24 * 60) % (24 * 60);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

function normalizeAdvanceMinutes(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.min(240, Math.max(0, Math.round(value!))) : fallback;
}

async function ensureReminderChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: '饮食与运动提醒（重要）',
      description: '餐前、运动和测试提醒；需要声音与振动',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      enableVibrate: true,
      vibrationPattern: [0, 300, 180, 300],
      enableLights: true,
      lightColor: '#2F7D5A',
      showBadge: true,
    });
  }
}

export async function requestNotificationPermission() {
  await ensureReminderChannel();
  const current = await Notifications.getPermissionsAsync();
  const allowed = current.status === 'granted'
    ? true
    : (await Notifications.requestPermissionsAsync()).status === 'granted';
  if (!allowed) return false;

  if (Platform.OS === 'android') {
    const channel = await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL_ID);
    if (channel?.importance === Notifications.AndroidImportance.NONE) {
      throw new Error('“饮食与运动提醒（重要）”通知类别已关闭，请在系统通知设置中重新开启');
    }
  }
  return true;
}

function reminderContent(title: string, body: string, data: Record<string, string> = {}) {
  return {
    title,
    body,
    data,
    sound: 'default' as const,
    priority: Notifications.AndroidNotificationPriority.MAX,
  };
}

export async function scheduleReminders(settings: ReminderSettings) {
  if (!settings.enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return 0;
  }

  const meals: Array<{ key: keyof ReminderSettings; title: string; body: string }> = [
    { key: 'breakfast', title: '早餐前的小准备 🌿', body: '记得按计划选择并记录食物。' },
    { key: 'lunch', title: '午餐时间快到了', body: '先看看今日剩余额度，食堂选餐会更从容。' },
    { key: 'dinner', title: '晚餐前看一眼预算', body: '根据今天的摄入，给晚餐留出合适空间。' },
    { key: 'snack', title: '加餐前先确认', body: '是真饿还是嘴馋？记录后再做决定也不迟。' },
  ];
  const activeMeals = meals.filter(meal => String(settings[meal.key]).trim());
  const exercise = settings.exercise.trim();
  const hasExerciseReminder = Boolean(exercise && settings.exerciseDays.length);
  if (!activeMeals.length && !hasExerciseReminder) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return 0;
  }

  const allowed = await requestNotificationPermission();
  if (!allowed) throw new Error('通知权限未开启，请在系统设置中允许通知');
  await Notifications.cancelAllScheduledNotificationsAsync();
  const mealAdvanceMin = normalizeAdvanceMinutes(settings.mealAdvanceMin, 30);
  const exerciseAdvanceMin = normalizeAdvanceMinutes(settings.exerciseAdvanceMin, 60);

  for (const meal of activeMeals) {
    const time = parseTime(String(settings[meal.key]).trim(), mealAdvanceMin);
    await Notifications.scheduleNotificationAsync({
      content: reminderContent(
        meal.title,
        mealAdvanceMin ? `还有 ${mealAdvanceMin} 分钟，${meal.body}` : meal.body,
        { screen: 'record' },
      ),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...time, channelId: REMINDER_CHANNEL_ID },
    });
  }

  if (hasExerciseReminder) {
    const exerciseTime = parseTime(exercise, exerciseAdvanceMin);
    for (const day of settings.exerciseDays) {
      // Expo/Android 周日为 1，因此将业务层周日 0 转成 1。
      const weekday = day === 0 ? 1 : day + 1;
      await Notifications.scheduleNotificationAsync({
        content: reminderContent(
          '今天有运动计划 💪',
          `${exerciseAdvanceMin ? `距离计划运动还有 ${exerciseAdvanceMin} 分钟，` : ''}提前补水并准备好装备。`,
          { screen: 'record', kind: 'exercise' },
        ),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          ...exerciseTime,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    }
  }

  const scheduled = (await Notifications.getAllScheduledNotificationsAsync())
    .filter(item => item.content.data?.kind !== 'test');
  const expected = activeMeals.length + (hasExerciseReminder ? settings.exerciseDays.length : 0);
  if (scheduled.length !== expected) {
    throw new Error(`系统仅成功安排 ${scheduled.length}/${expected} 条提醒，请检查通知和“闹钟与提醒”权限`);
  }
  return scheduled.length;
}

export async function rescheduleRemindersIfAuthorized(settings: ReminderSettings) {
  if (!settings.enabled) return cancelReminders();
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return;
  await scheduleReminders(settings);
}

export async function sendTestReminder() {
  const allowed = await requestNotificationPermission();
  if (!allowed) throw new Error('通知权限未开启，请在系统设置中允许通知');
  if (Platform.OS === 'android') {
    const channel = await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL_ID);
    if (!channel?.sound || !channel.enableVibrate || channel.importance < Notifications.AndroidImportance.HIGH) {
      throw new Error('提醒类别当前被设为静音或未开启振动，请点击“声音与振动设置”重新开启');
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: reminderContent(
      '轻脂管家测试提醒 🔔',
      '如果你看到横幅、听到提示音并感到振动，通知通道工作正常。',
      { kind: 'test' },
    ),
    // A short system alarm verifies the same out-of-process path used by meal
    // reminders. It also binds the notification explicitly to the audible
    // channel instead of Android's possibly silent fallback channel.
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      repeats: false,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

export interface ReminderDiagnostics {
  permissionGranted: boolean;
  scheduledCount: number;
  channelEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  lockscreenVisible: boolean;
}

export async function getReminderDiagnostics(): Promise<ReminderDiagnostics> {
  const [permission, scheduled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const reminderCount = scheduled.filter(item => item.content.data?.kind !== 'test').length;
  if (Platform.OS !== 'android') {
    return {
      permissionGranted: permission.status === 'granted',
      scheduledCount: reminderCount,
      channelEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      lockscreenVisible: true,
    };
  }
  await ensureReminderChannel();
  const channel = await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL_ID);
  return {
    permissionGranted: permission.status === 'granted',
    scheduledCount: reminderCount,
    channelEnabled: Boolean(channel && channel.importance >= Notifications.AndroidImportance.HIGH),
    soundEnabled: Boolean(channel?.sound),
    vibrationEnabled: Boolean(channel?.enableVibrate),
    lockscreenVisible: channel?.lockscreenVisibility !== Notifications.AndroidNotificationVisibility.SECRET,
  };
}

export function cancelReminders() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}
