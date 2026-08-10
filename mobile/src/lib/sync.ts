import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { downloadLatestBackup, uploadBackup } from './api';
import { exportSnapshot, getSyncStatus, restoreSnapshot, setBackupResult } from './database';
import { loadSession } from './session';

export const BACKUP_TASK = 'qingzhi-periodic-backup';

export async function backupNow(force = false) {
  const session = await loadSession();
  if (!session) return { skipped: true, message: '尚未登录' };
  const status = await getSyncStatus(session.user.id);
  if (!force && status && !status.dirty) return { skipped: true, message: '数据已是最新' };
  try {
    const snapshot = await exportSnapshot(session.user.id);
    const result = await uploadBackup(session.token, snapshot);
    await setBackupResult(session.user.id, true);
    return { skipped: false, backedUpAt: result.backedUpAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : '备份失败';
    await setBackupResult(session.user.id, false, message);
    throw error;
  }
}

export async function restoreLatestBackup() {
  const session = await loadSession();
  if (!session) throw new Error('请先登录');
  const result = await downloadLatestBackup(session.token);
  if (!result.snapshot) throw new Error('服务端暂无可恢复的备份');
  await restoreSnapshot(session.user.id, result.snapshot);
  return result.backedUpAt;
}

if (!TaskManager.isTaskDefined(BACKUP_TASK)) {
  TaskManager.defineTask(BACKUP_TASK, async () => {
    try {
      await backupNow(false);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerPeriodicBackup() {
  const registered = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK);
  if (!registered) {
    await BackgroundTask.registerTaskAsync(BACKUP_TASK, { minimumInterval: 360 });
  }
}
