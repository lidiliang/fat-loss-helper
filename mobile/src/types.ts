export type Gender = 'male' | 'female';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type FattyLiverLevel = 'none' | 'mild' | 'moderate' | 'severe';
export type FoodMeasureUnit = 'g' | 'ml';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface UserProfile {
  ownerId: string;
  name: string;
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  waistCm: number;
  fattyLiverLevel: FattyLiverLevel;
  activityLevel: ActivityLevel;
  weeklyLossKg: number;
  targetWeightKg: number;
  calorieGoal: number;
  proteinGoal: number;
  fatGoal: number;
  carbGoal: number;
  updatedAt: string;
}

export interface FoodItem {
  id: string;
  ownerId?: string | null;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  isCommon: boolean;
  nutritionUnit?: FoodMeasureUnit;
  servings?: FoodServing[];
}

export interface FoodServing {
  label: string;
  /** Base amount for nutrition calculation; prefer this for new data. */
  amount?: number;
  /** Legacy solid-food amount retained for existing data and backups. */
  grams?: number;
}

export interface MealRecord {
  id: string;
  ownerId: string;
  mealType: MealType;
  foodId: string;
  foodName: string;
  weightG: number;
  portionLabel?: string | null;
  sourceTemplateId?: string | null;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  recordedAt: string;
  updatedAt: string;
}

export interface ExerciseRecord {
  id: string;
  ownerId: string;
  exerciseType: string;
  durationMin: number;
  distanceKm?: number | null;
  met: number;
  caloriesBurned: number;
  recordedAt: string;
  updatedAt: string;
}

export interface WeightRecord {
  id: string;
  ownerId: string;
  weightKg: number;
  waistCm?: number | null;
  recordedDate: string;
  updatedAt: string;
}

export interface TemplateItem {
  foodId: string;
  weightG: number;
}

export interface MealTemplate {
  id: string;
  ownerId?: string | null;
  name: string;
  description: string;
  items: TemplateItem[];
  builtIn: boolean;
}

export interface ReminderSettings {
  ownerId: string;
  enabled: boolean;
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
  exercise: string;
  exerciseDays: number[];
  updatedAt: string;
}

export interface DailySummary {
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  burned: number;
  netCalories: number;
}

export interface DailyIntake {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
}

export interface BackupSnapshot {
  version: 1;
  exportedAt: string;
  profile: UserProfile | null;
  customFoods: FoodItem[];
  meals: MealRecord[];
  exercises: ExerciseRecord[];
  weights: WeightRecord[];
  templates: MealTemplate[];
  hiddenTemplateIds?: string[];
  reminders: ReminderSettings | null;
}

export type RootTab = 'home' | 'record' | 'trends' | 'settings';
