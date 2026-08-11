import { AppState } from 'react-native';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BUILT_IN_TEMPLATES, MEAL_LABELS } from '../data/seed';
import { calculateExerciseCalories, calculateFoodNutrition, dateKey, randomId, summarizeDay } from '../lib/calculations';
import {
  deleteCustomFood as deleteCustomFoodDb,
  deleteExercise as deleteExerciseDb,
  deleteMeal as deleteMealDb,
  deleteTemplate as deleteTemplateDb,
  getExercises,
  getDailyIntakes,
  getFoods,
  getHiddenTemplateIds,
  getMeals,
  getProfile,
  getReminders,
  getTemplates,
  getWeightRecords,
  saveCustomFood,
  saveExercise as saveExerciseDb,
  saveMeal,
  saveProfile as saveProfileDb,
  saveReminders as saveRemindersDb,
  saveTemplate,
  saveWeight,
} from '../lib/database';
import { scheduleReminders } from '../lib/notifications';
import { backupNow, registerPeriodicBackup } from '../lib/sync';
import {
  DailySummary,
  DailyIntake,
  ExerciseRecord,
  FoodItem,
  MealRecord,
  MealTemplate,
  MealType,
  ReminderSettings,
  UserProfile,
  WeightRecord,
} from '../types';
import { useAuth } from './AuthContext';

interface AppValue {
  loading: boolean;
  profile: UserProfile | null;
  foods: FoodItem[];
  meals: MealRecord[];
  exercises: ExerciseRecord[];
  weights: WeightRecord[];
  templates: MealTemplate[];
  reminders: ReminderSettings | null;
  dailyIntakes: DailyIntake[];
  selectedDate: string;
  summary: DailySummary;
  setSelectedDate: (date: string) => void;
  refresh: () => Promise<void>;
  saveProfile: (profile: UserProfile) => Promise<void>;
  addMeal: (food: FoodItem, weightG: number, mealType: MealType, portionLabel?: string | null) => Promise<void>;
  addTemplate: (template: MealTemplate, mealType: MealType) => Promise<void>;
  deleteTemplate: (template: MealTemplate) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  addExercise: (type: string, met: number, durationMin: number, distanceKm?: number) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  addWeight: (weightKg: number, waistCm?: number) => Promise<void>;
  addCustomFood: (food: Omit<FoodItem, 'id' | 'ownerId'>) => Promise<void>;
  deleteCustomFood: (id: string) => Promise<void>;
  createTemplateFromMeal: (mealType: MealType, name: string) => Promise<void>;
  saveReminders: (settings: ReminderSettings) => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);
const EMPTY_SUMMARY: DailySummary = { calories: 0, protein: 0, fat: 0, carb: 0, burned: 0, netCalories: 0 };

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>(BUILT_IN_TEMPLATES);
  const [reminders, setRemindersState] = useState<ReminderSettings | null>(null);
  const [dailyIntakes, setDailyIntakes] = useState<DailyIntake[]>([]);
  const [selectedDate, setSelectedDate] = useState(dateKey());

  const refresh = useCallback(async () => {
    if (!user) return;
    const [nextProfile, nextFoods, nextMeals, nextExercises, nextWeights, customTemplates, hiddenTemplateIds, nextReminders, nextDailyIntakes] = await Promise.all([
      getProfile(user.id),
      getFoods(user.id),
      getMeals(user.id, selectedDate),
      getExercises(user.id, selectedDate),
      getWeightRecords(user.id),
      getTemplates(user.id),
      getHiddenTemplateIds(user.id),
      getReminders(user.id),
      getDailyIntakes(user.id),
    ]);
    setProfile(nextProfile);
    setFoods(nextFoods);
    setMeals(nextMeals);
    setExercises(nextExercises);
    setWeights(nextWeights);
    const hidden = new Set(hiddenTemplateIds);
    setTemplates([...customTemplates, ...BUILT_IN_TEMPLATES.filter(template => !hidden.has(template.id))]);
    setRemindersState(nextReminders);
    setDailyIntakes(nextDailyIntakes);
    setLoading(false);
  }, [user, selectedDate]);

  useEffect(() => {
    setLoading(true);
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    registerPeriodicBackup().catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') backupNow(false).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  const ensureUser = () => {
    if (!user) throw new Error('请先登录');
    return user;
  };

  const value = useMemo<AppValue>(() => ({
    loading,
    profile,
    foods,
    meals,
    exercises,
    weights,
    templates,
    reminders,
    dailyIntakes,
    selectedDate,
    summary: profile ? summarizeDay(meals, exercises) : EMPTY_SUMMARY,
    setSelectedDate,
    refresh,
    saveProfile: async nextProfile => {
      await saveProfileDb(nextProfile);
      setProfile(nextProfile);
    },
    addMeal: async (food, weightG, mealType, portionLabel) => {
      const owner = ensureUser();
      const nutrition = calculateFoodNutrition(food, weightG);
      const now = new Date().toISOString();
      const recordedAt = `${selectedDate}T12:00:00`;
      await saveMeal({
        id: randomId('meal'), ownerId: owner.id, mealType, foodId: food.id, foodName: food.name,
        weightG, portionLabel: portionLabel ?? null, ...nutrition, recordedAt, updatedAt: now,
      }, selectedDate);
      await refresh();
    },
    addTemplate: async (template, mealType) => {
      const owner = ensureUser();
      if (meals.some(item => item.mealType === mealType && item.sourceTemplateId === template.id)) {
        throw new Error(`“${template.name}”已经添加到${MEAL_LABELS[mealType]}，如需重新添加请先删除该组合的已有记录。`);
      }
      const now = new Date().toISOString();
      const recordedAt = `${selectedDate}T12:00:00`;
      for (const item of template.items) {
        const food = foods.find(candidate => candidate.id === item.foodId);
        if (!food) continue;
        const nutrition = calculateFoodNutrition(food, item.weightG);
        await saveMeal({
          id: randomId('meal'), ownerId: owner.id, mealType, foodId: food.id, foodName: food.name,
          weightG: item.weightG, sourceTemplateId: template.id, ...nutrition, recordedAt, updatedAt: now,
        }, selectedDate);
      }
      await refresh();
    },
    deleteTemplate: async template => {
      const owner = ensureUser();
      await deleteTemplateDb(template, owner.id);
      await refresh();
    },
    deleteMeal: async id => {
      const owner = ensureUser();
      await deleteMealDb(id, owner.id);
      await refresh();
    },
    addExercise: async (type, met, durationMin, distanceKm) => {
      const owner = ensureUser();
      const now = new Date().toISOString();
      const record: ExerciseRecord = {
        id: randomId('exercise'), ownerId: owner.id, exerciseType: type, durationMin,
        distanceKm: distanceKm || null, met,
        caloriesBurned: calculateExerciseCalories(met, profile?.weightKg ?? 70, durationMin),
        recordedAt: `${selectedDate}T19:30:00`, updatedAt: now,
      };
      await saveExerciseDb(record, selectedDate);
      await refresh();
    },
    deleteExercise: async id => {
      const owner = ensureUser();
      await deleteExerciseDb(id, owner.id);
      await refresh();
    },
    addWeight: async (weightKg, waistCm) => {
      const owner = ensureUser();
      const now = new Date().toISOString();
      const record: WeightRecord = {
        id: randomId('weight'), ownerId: owner.id, weightKg, waistCm: waistCm || null,
        recordedDate: selectedDate, updatedAt: now,
      };
      await saveWeight(record);
      await refresh();
    },
    addCustomFood: async food => {
      const owner = ensureUser();
      await saveCustomFood({ ...food, id: randomId('food'), ownerId: owner.id }, owner.id);
      await refresh();
    },
    deleteCustomFood: async id => {
      const owner = ensureUser();
      await deleteCustomFoodDb(id, owner.id);
      await refresh();
    },
    createTemplateFromMeal: async (mealType, name) => {
      const owner = ensureUser();
      const records = meals.filter(item => item.mealType === mealType);
      if (!records.length) throw new Error('这个餐次还没有可保存的记录');
      await saveTemplate({
        id: randomId('tpl'), ownerId: owner.id, name,
        description: records.map(item => item.foodName).join(' + '),
        items: records.map(item => ({ foodId: item.foodId, weightG: item.weightG })), builtIn: false,
      }, owner.id);
      await refresh();
    },
    saveReminders: async settings => {
      await saveRemindersDb(settings);
      await scheduleReminders(settings);
      setRemindersState(settings);
    },
  }), [loading, profile, foods, meals, exercises, weights, templates, reminders, dailyIntakes, selectedDate, refresh, user]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp 必须在 AppProvider 内使用');
  return value;
}
