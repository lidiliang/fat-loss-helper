import { ACTIVITY_LEVELS } from '../data/seed';
import { DailySummary, ExerciseRecord, Gender, MealRecord, UserProfile } from '../types';

export function calculateGoals(input: {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: UserProfile['activityLevel'];
  weeklyLossKg: number;
}) {
  const genderOffset = input.gender === 'male' ? 5 : -161;
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + genderOffset;
  const factor = ACTIVITY_LEVELS.find(item => item.value === input.activityLevel)?.factor ?? 1.2;
  const tdee = bmr * factor;
  const requestedDeficit = (Math.max(0, input.weeklyLossKg) * 7700) / 7;
  const maxSafeDeficit = tdee * 0.3;
  const minimumCalories = input.gender === 'male' ? 1500 : 1200;
  const calorieGoal = Math.round(Math.max(minimumCalories, tdee - Math.min(requestedDeficit, maxSafeDeficit)));
  // 脂肪肝生活方式管理：蛋白质 25%、脂肪 25%、碳水 50%，不是医疗处方。
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calorieGoal,
    proteinGoal: Math.round((calorieGoal * 0.25) / 4),
    fatGoal: Math.round((calorieGoal * 0.25) / 9),
    carbGoal: Math.round((calorieGoal * 0.5) / 4),
  };
}

export function calculateFoodNutrition(food: { calories: number; protein: number; fat: number; carb: number }, weightG: number) {
  const ratio = weightG / 100;
  return {
    calories: round(food.calories * ratio, 0),
    protein: round(food.protein * ratio),
    fat: round(food.fat * ratio),
    carb: round(food.carb * ratio),
  };
}

export function calculateExerciseCalories(met: number, weightKg: number, durationMin: number) {
  return Math.round(met * weightKg * (durationMin / 60));
}

export function summarizeDay(meals: MealRecord[], exercises: ExerciseRecord[]): DailySummary {
  const eaten = meals.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      fat: sum.fat + item.fat,
      carb: sum.carb + item.carb,
    }),
    { calories: 0, protein: 0, fat: 0, carb: 0 },
  );
  const burned = exercises.reduce((sum, item) => sum + item.caloriesBurned, 0);
  return { ...eaten, burned, netCalories: eaten.calories - burned };
}

export function getMealRecommendation(profile: UserProfile, summary: DailySummary, completedMealCount: number) {
  const remainingMeals = Math.max(1, 4 - completedMealCount);
  const calories = Math.max(0, Math.round((profile.calorieGoal - summary.calories) / remainingMeals));
  const fat = Math.max(0, Math.round((profile.fatGoal - summary.fat) / remainingMeals));
  const protein = Math.max(0, Math.round((profile.proteinGoal - summary.protein) / remainingMeals));
  const overFat = summary.fat > profile.fatGoal * 0.75;
  const lowProtein = summary.protein < profile.proteinGoal * 0.45;
  let message = '优先选择一拳主食、一掌蛋白质和两拳蔬菜。';
  if (overFat) message = '今天油脂偏高，下一餐建议清蒸鱼、豆腐或水煮菜，少用炒制酱汁。';
  else if (lowProtein) message = '蛋白质进度偏慢，下一餐可选择鸡胸肉、鱼虾或豆制品。';
  return { calories, fat, protein, message };
}

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localIsoAt(date: string, time = '12:00') {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function randomId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function round(value: number, digits = 1) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}
