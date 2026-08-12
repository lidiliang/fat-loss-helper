import { AIDailyContext, DailySummary, ExerciseRecord, MealRecord, UserProfile } from '../types';

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildAIDailyContext(input: {
  date: string;
  profile: UserProfile;
  summary: DailySummary;
  meals: MealRecord[];
  exercises: ExerciseRecord[];
}): AIDailyContext {
  const meals = [...input.meals]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => ({
      mealType: item.mealType,
      foodName: item.foodName,
      weightG: item.weightG,
      portionLabel: item.portionLabel,
      calories: item.calories,
      protein: item.protein,
      fat: item.fat,
      carb: item.carb,
    }));
  const exercises = [...input.exercises]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => ({
      exerciseType: item.exerciseType,
      durationMin: item.durationMin,
      distanceKm: item.distanceKm,
      caloriesBurned: item.caloriesBurned,
    }));
  const profile = {
    gender: input.profile.gender,
    age: input.profile.age,
    heightCm: input.profile.heightCm,
    weightKg: input.profile.weightKg,
    waistCm: input.profile.waistCm,
    fattyLiverLevel: input.profile.fattyLiverLevel,
    activityLevel: input.profile.activityLevel,
    weeklyLossKg: input.profile.weeklyLossKg,
  };
  const summary = {
    ...input.summary,
    calorieGoal: input.profile.calorieGoal,
    proteinGoal: input.profile.proteinGoal,
    fatGoal: input.profile.fatGoal,
    carbGoal: input.profile.carbGoal,
  };
  const versionSource = JSON.stringify({ date: input.date, profile, summary, meals, exercises });
  return { date: input.date, version: `v1-${stableHash(versionSource)}`, profile, summary, meals, exercises };
}
