import * as SQLite from 'expo-sqlite';
import { COMMON_FOODS } from '../data/seed';
import {
  BackupSnapshot,
  DailyIntake,
  ExerciseRecord,
  FoodItem,
  MealRecord,
  MealTemplate,
  ReminderSettings,
  UserProfile,
  WeightRecord,
} from '../types';

const databasePromise = SQLite.openDatabaseAsync('qingzhi.db');

export async function initDatabase() {
  const db = await databasePromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      owner_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      age INTEGER NOT NULL,
      height_cm REAL NOT NULL,
      weight_kg REAL NOT NULL,
      waist_cm REAL NOT NULL,
      fatty_liver_level TEXT NOT NULL DEFAULT 'none',
      activity_level TEXT NOT NULL,
      weekly_loss_kg REAL NOT NULL,
      target_weight_kg REAL NOT NULL,
      calorie_goal INTEGER NOT NULL,
      protein_goal INTEGER NOT NULL,
      fat_goal INTEGER NOT NULL,
      carb_goal INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS food_items (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carb REAL NOT NULL,
      is_common INTEGER NOT NULL DEFAULT 0,
      servings_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_food_owner ON food_items(owner_id);
    CREATE TABLE IF NOT EXISTS meal_records (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      food_id TEXT NOT NULL,
      food_name TEXT NOT NULL,
      weight_g REAL NOT NULL,
      portion_label TEXT,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carb REAL NOT NULL,
      day_key TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meal_owner_day ON meal_records(owner_id, day_key);
    CREATE TABLE IF NOT EXISTS exercise_records (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      exercise_type TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      distance_km REAL,
      met REAL NOT NULL,
      calories_burned REAL NOT NULL,
      day_key TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_exercise_owner_day ON exercise_records(owner_id, day_key);
    CREATE TABLE IF NOT EXISTS weight_records (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      waist_cm REAL,
      recorded_date TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_owner_day ON weight_records(owner_id, recorded_date);
    CREATE TABLE IF NOT EXISTS meal_templates (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      items_json TEXT NOT NULL,
      built_in INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_template_owner ON meal_templates(owner_id);
    CREATE TABLE IF NOT EXISTS reminder_settings (
      owner_id TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL,
      breakfast TEXT NOT NULL,
      lunch TEXT NOT NULL,
      dinner TEXT NOT NULL,
      snack TEXT NOT NULL,
      exercise TEXT NOT NULL,
      exercise_days_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      owner_id TEXT PRIMARY KEY NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1,
      last_backup_at TEXT,
      last_error TEXT
    );
  `);

  // CREATE TABLE IF NOT EXISTS does not add new columns on upgrades. Keep existing
  // installations compatible without replacing or clearing the user's database.
  const foodColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(food_items)');
  if (!foodColumns.some(column => column.name === 'servings_json')) {
    await db.execAsync("ALTER TABLE food_items ADD COLUMN servings_json TEXT NOT NULL DEFAULT '[]'");
  }
  const mealColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(meal_records)');
  if (!mealColumns.some(column => column.name === 'portion_label')) {
    await db.execAsync('ALTER TABLE meal_records ADD COLUMN portion_label TEXT');
  }
  const profileColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(profiles)');
  if (!profileColumns.some(column => column.name === 'fatty_liver_level')) {
    await db.execAsync("ALTER TABLE profiles ADD COLUMN fatty_liver_level TEXT NOT NULL DEFAULT 'none'");
  }
}

export async function getProfile(ownerId: string): Promise<UserProfile | null> {
  const db = await databasePromise;
  return db.getFirstAsync<UserProfile>(
    `SELECT owner_id AS ownerId, name, gender, age, height_cm AS heightCm,
      weight_kg AS weightKg, waist_cm AS waistCm, fatty_liver_level AS fattyLiverLevel,
      activity_level AS activityLevel,
      weekly_loss_kg AS weeklyLossKg, target_weight_kg AS targetWeightKg,
      calorie_goal AS calorieGoal, protein_goal AS proteinGoal, fat_goal AS fatGoal,
      carb_goal AS carbGoal, updated_at AS updatedAt
     FROM profiles WHERE owner_id = ?`,
    ownerId,
  );
}

export async function saveProfile(profile: UserProfile) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT INTO profiles
     (owner_id, name, gender, age, height_cm, weight_kg, waist_cm, fatty_liver_level,
      activity_level, weekly_loss_kg, target_weight_kg, calorie_goal, protein_goal,
      fat_goal, carb_goal, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name, gender=excluded.gender,
       age=excluded.age, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg,
       waist_cm=excluded.waist_cm, fatty_liver_level=excluded.fatty_liver_level,
       activity_level=excluded.activity_level,
       weekly_loss_kg=excluded.weekly_loss_kg, target_weight_kg=excluded.target_weight_kg,
       calorie_goal=excluded.calorie_goal, protein_goal=excluded.protein_goal,
       fat_goal=excluded.fat_goal, carb_goal=excluded.carb_goal, updated_at=excluded.updated_at`,
    profile.ownerId,
    profile.name,
    profile.gender,
    profile.age,
    profile.heightCm,
    profile.weightKg,
    profile.waistCm,
    profile.fattyLiverLevel ?? 'none',
    profile.activityLevel,
    profile.weeklyLossKg,
    profile.targetWeightKg,
    profile.calorieGoal,
    profile.proteinGoal,
    profile.fatGoal,
    profile.carbGoal,
    profile.updatedAt,
  );
  await markDirty(profile.ownerId);
}

export async function getFoods(ownerId: string): Promise<FoodItem[]> {
  const db = await databasePromise;
  const custom = await db.getAllAsync<FoodItem & { servingsJson: string }>(
    `SELECT id, owner_id AS ownerId, name, calories, protein, fat, carb,
      is_common AS isCommon, servings_json AS servingsJson
     FROM food_items WHERE owner_id = ? ORDER BY name`,
    ownerId,
  );
  return [
    ...custom.map(({ servingsJson, ...item }) => ({
      ...item,
      isCommon: Boolean(item.isCommon),
      servings: JSON.parse(servingsJson || '[]'),
    })),
    ...COMMON_FOODS,
  ];
}

export async function saveCustomFood(food: FoodItem, ownerId: string) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO food_items
     (id, owner_id, name, calories, protein, fat, carb, is_common, servings_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    food.id,
    ownerId,
    food.name,
    food.calories,
    food.protein,
    food.fat,
    food.carb,
    food.isCommon ? 1 : 0,
    JSON.stringify(food.servings ?? []),
  );
  await markDirty(ownerId);
}

export async function deleteCustomFood(id: string, ownerId: string) {
  const db = await databasePromise;
  await db.withTransactionAsync(async () => {
    const templates = await db.getAllAsync<{ id: string; itemsJson: string }>(
      `SELECT id, items_json AS itemsJson FROM meal_templates WHERE owner_id = ?`,
      ownerId,
    );
    for (const template of templates) {
      const existingItems = JSON.parse(template.itemsJson) as Array<{ foodId: string; weightG: number }>;
      const items = existingItems
        .filter(item => item.foodId !== id);
      if (!items.length) {
        await db.runAsync('DELETE FROM meal_templates WHERE id = ? AND owner_id = ?', template.id, ownerId);
      } else if (items.length !== existingItems.length) {
        await db.runAsync(
          'UPDATE meal_templates SET items_json = ? WHERE id = ? AND owner_id = ?',
          JSON.stringify(items), template.id, ownerId,
        );
      }
    }
    await db.runAsync('DELETE FROM food_items WHERE id = ? AND owner_id = ?', id, ownerId);
  });
  await markDirty(ownerId);
}

export async function getMeals(ownerId: string, day: string): Promise<MealRecord[]> {
  const db = await databasePromise;
  return db.getAllAsync<MealRecord>(
    `SELECT id, owner_id AS ownerId, meal_type AS mealType, food_id AS foodId,
      food_name AS foodName, weight_g AS weightG, calories, protein, fat, carb,
      portion_label AS portionLabel,
      recorded_at AS recordedAt, updated_at AS updatedAt
     FROM meal_records WHERE owner_id = ? AND day_key = ? ORDER BY recorded_at`,
    ownerId,
    day,
  );
}

export async function getDailyIntakes(ownerId: string, limit = 30): Promise<DailyIntake[]> {
  const db = await databasePromise;
  return db.getAllAsync<DailyIntake>(
    `SELECT day_key AS date, SUM(calories) AS calories, SUM(protein) AS protein,
      SUM(fat) AS fat, SUM(carb) AS carb FROM meal_records
     WHERE owner_id = ? GROUP BY day_key ORDER BY day_key DESC LIMIT ?`,
    ownerId,
    limit,
  );
}

export async function saveMeal(record: MealRecord, day: string) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO meal_records
     (id, owner_id, meal_type, food_id, food_name, weight_g, portion_label, calories, protein, fat, carb, day_key, recorded_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.ownerId,
    record.mealType,
    record.foodId,
    record.foodName,
    record.weightG,
    record.portionLabel ?? null,
    record.calories,
    record.protein,
    record.fat,
    record.carb,
    day,
    record.recordedAt,
    record.updatedAt,
  );
  await markDirty(record.ownerId);
}

export async function deleteMeal(id: string, ownerId: string) {
  const db = await databasePromise;
  await db.runAsync('DELETE FROM meal_records WHERE id = ? AND owner_id = ?', id, ownerId);
  await markDirty(ownerId);
}

export async function getExercises(ownerId: string, day: string): Promise<ExerciseRecord[]> {
  const db = await databasePromise;
  return db.getAllAsync<ExerciseRecord>(
    `SELECT id, owner_id AS ownerId, exercise_type AS exerciseType,
      duration_min AS durationMin, distance_km AS distanceKm, met,
      calories_burned AS caloriesBurned, recorded_at AS recordedAt, updated_at AS updatedAt
     FROM exercise_records WHERE owner_id = ? AND day_key = ? ORDER BY recorded_at`,
    ownerId,
    day,
  );
}

export async function saveExercise(record: ExerciseRecord, day: string) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO exercise_records
     (id, owner_id, exercise_type, duration_min, distance_km, met, calories_burned, day_key, recorded_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.ownerId,
    record.exerciseType,
    record.durationMin,
    record.distanceKm ?? null,
    record.met,
    record.caloriesBurned,
    day,
    record.recordedAt,
    record.updatedAt,
  );
  await markDirty(record.ownerId);
}

export async function deleteExercise(id: string, ownerId: string) {
  const db = await databasePromise;
  await db.runAsync('DELETE FROM exercise_records WHERE id = ? AND owner_id = ?', id, ownerId);
  await markDirty(ownerId);
}

export async function getWeightRecords(ownerId: string, limit = 31): Promise<WeightRecord[]> {
  const db = await databasePromise;
  return db.getAllAsync<WeightRecord>(
    `SELECT id, owner_id AS ownerId, weight_kg AS weightKg, waist_cm AS waistCm,
      recorded_date AS recordedDate, updated_at AS updatedAt FROM weight_records
     WHERE owner_id = ? ORDER BY recorded_date DESC LIMIT ?`,
    ownerId,
    limit,
  );
}

export async function saveWeight(record: WeightRecord) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT INTO weight_records (id, owner_id, weight_kg, waist_cm, recorded_date, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, recorded_date) DO UPDATE SET weight_kg=excluded.weight_kg,
       waist_cm=excluded.waist_cm, updated_at=excluded.updated_at`,
    record.id,
    record.ownerId,
    record.weightKg,
    record.waistCm ?? null,
    record.recordedDate,
    record.updatedAt,
  );
  await markDirty(record.ownerId);
}

export async function getTemplates(ownerId: string): Promise<MealTemplate[]> {
  const db = await databasePromise;
  const rows = await db.getAllAsync<{
    id: string; ownerId: string; name: string; description: string; itemsJson: string; builtIn: number;
  }>(
    `SELECT id, owner_id AS ownerId, name, description, items_json AS itemsJson, built_in AS builtIn
     FROM meal_templates WHERE owner_id = ? ORDER BY name`,
    ownerId,
  );
  return rows.map(row => ({
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    items: JSON.parse(row.itemsJson),
    builtIn: Boolean(row.builtIn),
  }));
}

export async function saveTemplate(template: MealTemplate, ownerId: string) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO meal_templates (id, owner_id, name, description, items_json, built_in)
     VALUES (?, ?, ?, ?, ?, ?)`,
    template.id,
    ownerId,
    template.name,
    template.description,
    JSON.stringify(template.items),
    template.builtIn ? 1 : 0,
  );
  await markDirty(ownerId);
}

export async function getReminders(ownerId: string): Promise<ReminderSettings> {
  const db = await databasePromise;
  const row = await db.getFirstAsync<{
    ownerId: string; enabled: number; breakfast: string; lunch: string; dinner: string;
    snack: string; exercise: string; exerciseDaysJson: string; updatedAt: string;
  }>(
    `SELECT owner_id AS ownerId, enabled, breakfast, lunch, dinner, snack, exercise,
      exercise_days_json AS exerciseDaysJson, updated_at AS updatedAt
     FROM reminder_settings WHERE owner_id = ?`,
    ownerId,
  );
  if (row) {
    return { ...row, enabled: Boolean(row.enabled), exerciseDays: JSON.parse(row.exerciseDaysJson) };
  }
  const defaults: ReminderSettings = {
    ownerId,
    enabled: true,
    breakfast: '07:30',
    lunch: '12:00',
    dinner: '18:30',
    snack: '',
    exercise: '19:30',
    exerciseDays: [1, 3, 5],
    updatedAt: new Date().toISOString(),
  };
  await saveReminders(defaults);
  return defaults;
}

export async function saveReminders(settings: ReminderSettings) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO reminder_settings
     (owner_id, enabled, breakfast, lunch, dinner, snack, exercise, exercise_days_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    settings.ownerId,
    settings.enabled ? 1 : 0,
    settings.breakfast,
    settings.lunch,
    settings.dinner,
    settings.snack,
    settings.exercise,
    JSON.stringify(settings.exerciseDays),
    settings.updatedAt,
  );
  await markDirty(settings.ownerId);
}

export async function markDirty(ownerId: string) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT INTO sync_meta (owner_id, dirty) VALUES (?, 1)
     ON CONFLICT(owner_id) DO UPDATE SET dirty=1`,
    ownerId,
  );
}

export async function setBackupResult(ownerId: string, success: boolean, error?: string) {
  const db = await databasePromise;
  await db.runAsync(
    `INSERT INTO sync_meta (owner_id, dirty, last_backup_at, last_error) VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET dirty=excluded.dirty,
       last_backup_at=COALESCE(excluded.last_backup_at, sync_meta.last_backup_at), last_error=excluded.last_error`,
    ownerId,
    success ? 0 : 1,
    success ? new Date().toISOString() : null,
    error ?? null,
  );
}

export async function getSyncStatus(ownerId: string) {
  const db = await databasePromise;
  return db.getFirstAsync<{ dirty: number; lastBackupAt: string | null; lastError: string | null }>(
    `SELECT dirty, last_backup_at AS lastBackupAt, last_error AS lastError
     FROM sync_meta WHERE owner_id = ?`,
    ownerId,
  );
}

export async function exportSnapshot(ownerId: string): Promise<BackupSnapshot> {
  const db = await databasePromise;
  const [profile, customFoods, meals, exercises, weights, templates, reminders] = await Promise.all([
    getProfile(ownerId),
    db.getAllAsync<FoodItem & { servingsJson: string }>(
      `SELECT id, owner_id AS ownerId, name, calories, protein, fat, carb,
        is_common AS isCommon, servings_json AS servingsJson
       FROM food_items WHERE owner_id = ?`, ownerId,
    ),
    db.getAllAsync<MealRecord>(
      `SELECT id, owner_id AS ownerId, meal_type AS mealType, food_id AS foodId, food_name AS foodName,
        weight_g AS weightG, portion_label AS portionLabel, calories, protein, fat, carb,
        recorded_at AS recordedAt, updated_at AS updatedAt
       FROM meal_records WHERE owner_id = ?`, ownerId,
    ),
    db.getAllAsync<ExerciseRecord>(
      `SELECT id, owner_id AS ownerId, exercise_type AS exerciseType, duration_min AS durationMin,
        distance_km AS distanceKm, met, calories_burned AS caloriesBurned,
        recorded_at AS recordedAt, updated_at AS updatedAt
       FROM exercise_records WHERE owner_id = ?`, ownerId,
    ),
    getWeightRecords(ownerId, 10000),
    getTemplates(ownerId),
    getReminders(ownerId),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    customFoods: customFoods.map(({ servingsJson, ...item }) => ({
      ...item,
      isCommon: Boolean(item.isCommon),
      servings: JSON.parse(servingsJson || '[]'),
    })),
    meals,
    exercises,
    weights,
    templates,
    reminders,
  };
}

export async function restoreSnapshot(ownerId: string, snapshot: BackupSnapshot) {
  const db = await databasePromise;
  await db.withTransactionAsync(async () => {
    for (const table of ['profiles', 'food_items', 'meal_records', 'exercise_records', 'weight_records', 'meal_templates', 'reminder_settings']) {
      await db.runAsync(`DELETE FROM ${table} WHERE owner_id = ?`, ownerId);
    }
    if (snapshot.profile) {
      await saveProfile({ ...snapshot.profile, ownerId, fattyLiverLevel: snapshot.profile.fattyLiverLevel ?? 'none' });
    }
    for (const food of snapshot.customFoods) {
      await saveCustomFood({ ...food, ownerId, servings: food.servings ?? [] }, ownerId);
    }
    for (const meal of snapshot.meals) {
      await saveMeal({ ...meal, ownerId, portionLabel: meal.portionLabel ?? null }, meal.recordedAt.slice(0, 10));
    }
    for (const exercise of snapshot.exercises) await saveExercise({ ...exercise, ownerId }, exercise.recordedAt.slice(0, 10));
    for (const weight of snapshot.weights) await saveWeight({ ...weight, ownerId });
    for (const template of snapshot.templates) await saveTemplate({ ...template, ownerId }, ownerId);
    if (snapshot.reminders) await saveReminders({ ...snapshot.reminders, ownerId });
  });
  await setBackupResult(ownerId, true);
}
