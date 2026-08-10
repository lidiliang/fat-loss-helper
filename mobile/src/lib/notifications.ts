import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ReminderSettings } from '../types';

const CHANNEL_ID = 'healthy-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function parseTime(value: string, minutesBefore = 0) {
  const [rawHour, rawMinute] = value.split(':').map(Number);
  const total = (rawHour * 60 + rawMinute - minutesBefore + 24 * 60) % (24 * 60);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export async function requestNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '饮食与运动提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#2F7D5A',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

export async function scheduleReminders(settings: ReminderSettings) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return;
  const allowed = await requestNotificationPermission();
  if (!allowed) throw new Error('通知权限未开启，请在系统设置中允许通知');

  const meals: Array<{ key: keyof ReminderSettings; title: string; body: string }> = [
    { key: 'breakfast', title: '早餐前的小准备 🌿', body: '还有 30 分钟到早餐，记得按计划选择并记录食物。' },
    { key: 'lunch', title: '午餐时间快到了', body: '先看看今日剩余额度，食堂选餐会更从容。' },
    { key: 'dinner', title: '晚餐前看一眼预算', body: '根据今天的摄入，给晚餐留出合适空间。' },
    { key: 'snack', title: '加餐前先确认', body: '是真饿还是嘴馋？记录后再做决定也不迟。' },
  ];
  for (const meal of meals) {
    const time = parseTime(String(settings[meal.key]), 30);
    await Notifications.scheduleNotificationAsync({
      content: { title: meal.title, body: meal.body, data: { screen: 'record' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...time, channelId: CHANNEL_ID },
    });
  }

  const exerciseTime = parseTime(settings.exercise, 60);
  for (const day of settings.exerciseDays) {
    // Expo/Android 周日为 1，因此将业务层周日 0 转成 1。
    const weekday = day === 0 ? 1 : day + 1;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '今天有运动计划 💪',
        body: `计划 ${settings.exercise} 开始运动，提前补水并准备好装备。`,
        data: { screen: 'record', kind: 'exercise' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        ...exerciseTime,
        channelId: CHANNEL_ID,
      },
    });
  }
}

export function cancelReminders() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}
