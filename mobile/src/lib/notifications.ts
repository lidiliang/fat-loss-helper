import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ReminderSettings } from '../types';

// Android keeps a channel's user-visible importance/sound policy after it is
// first created. A new id lets upgraded installs receive the audible policy.
const CHANNEL_ID = 'healthy-reminders-v2';

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

async function ensureReminderChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '饮食与运动提醒（重要）',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 300, 180, 300],
      lightColor: '#2F7D5A',
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
    const channel = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
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
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return;

  const meals: Array<{ key: keyof ReminderSettings; title: string; body: string }> = [
    { key: 'breakfast', title: '早餐前的小准备 🌿', body: '还有 30 分钟到早餐，记得按计划选择并记录食物。' },
    { key: 'lunch', title: '午餐时间快到了', body: '先看看今日剩余额度，食堂选餐会更从容。' },
    { key: 'dinner', title: '晚餐前看一眼预算', body: '根据今天的摄入，给晚餐留出合适空间。' },
    { key: 'snack', title: '加餐前先确认', body: '是真饿还是嘴馋？记录后再做决定也不迟。' },
  ];
  const activeMeals = meals.filter(meal => String(settings[meal.key]).trim());
  const exercise = settings.exercise.trim();
  const hasExerciseReminder = Boolean(exercise && settings.exerciseDays.length);
  if (!activeMeals.length && !hasExerciseReminder) return;

  const allowed = await requestNotificationPermission();
  if (!allowed) throw new Error('通知权限未开启，请在系统设置中允许通知');

  for (const meal of activeMeals) {
    const time = parseTime(String(settings[meal.key]).trim(), 30);
    await Notifications.scheduleNotificationAsync({
      content: reminderContent(meal.title, meal.body, { screen: 'record' }),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...time, channelId: CHANNEL_ID },
    });
  }

  if (hasExerciseReminder) {
    const exerciseTime = parseTime(exercise, 60);
    for (const day of settings.exerciseDays) {
      // Expo/Android 周日为 1，因此将业务层周日 0 转成 1。
      const weekday = day === 0 ? 1 : day + 1;
      await Notifications.scheduleNotificationAsync({
        content: reminderContent(
          '今天有运动计划 💪',
          `计划 ${exercise} 开始运动，提前补水并准备好装备。`,
          { screen: 'record', kind: 'exercise' },
        ),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          ...exerciseTime,
          channelId: CHANNEL_ID,
        },
      });
    }
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const expected = activeMeals.length + (hasExerciseReminder ? settings.exerciseDays.length : 0);
  if (scheduled.length !== expected) {
    throw new Error(`系统仅成功安排 ${scheduled.length}/${expected} 条提醒，请检查通知和“闹钟与提醒”权限`);
  }
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
  await Notifications.scheduleNotificationAsync({
    content: reminderContent(
      '轻脂管家测试提醒 🔔',
      '如果你看到横幅、听到提示音并感到振动，通知通道工作正常。',
      { kind: 'test' },
    ),
    trigger: null,
  });
}

export function cancelReminders() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}
