import { calculateFoodNutrition } from './calculations';
import { FoodItem, FoodPreference, MealTemplate, MealType } from '../types';

export interface MiniMealRecommendation {
  template: MealTemplate;
  calories: number;
  protein: number;
  badge: string;
}

interface Recipe {
  kind: 'history' | 'balanced' | 'quick';
  name: string;
  badge: string;
  items: Array<{ foodId: string; amount: number }>;
}

const PROTEIN_IDS = new Set([
  'egg', 'egg-white', 'chicken-breast', 'skinless-drumstick', 'lean-pork', 'beef',
  'salmon', 'cod', 'bass', 'tuna-water', 'shrimp', 'tofu', 'skim-milk',
  'low-fat-yogurt', 'soy-milk',
]);
const VEGETABLE_IDS = new Set([
  'konjac-noodles', 'bok-choy', 'broccoli', 'cucumber', 'tomato', 'carrot',
  'winter-melon', 'lettuce', 'spinach', 'mushroom',
]);
const CARB_IDS = new Set(['rice', 'brown-rice', 'oats', 'whole-wheat-bread', 'sweet-potato', 'corn', 'chinese-yam']);
const SNACK_IDS = new Set([
  'apple', 'orange', 'blueberry', 'banana', 'watermelon', 'pear', 'grape', 'strawberry',
  'kiwi', 'peach', 'skim-milk', 'low-fat-yogurt', 'walnut', 'almond', 'egg',
]);

const BASE_RECIPES: Record<MealType, Recipe[]> = {
  breakfast: [
    { kind: 'balanced', name: '高蛋白早餐', badge: '均衡推荐', items: [{ foodId: 'egg', amount: 50 }, { foodId: 'skim-milk', amount: 250 }, { foodId: 'whole-wheat-bread', amount: 60 }] },
    { kind: 'quick', name: '燕麦牛奶组合', badge: '方便快手', items: [{ foodId: 'oats', amount: 35 }, { foodId: 'skim-milk', amount: 250 }, { foodId: 'egg', amount: 50 }] },
  ],
  lunch: [
    { kind: 'balanced', name: '鸡胸均衡餐', badge: '均衡推荐', items: [{ foodId: 'chicken-breast', amount: 120 }, { foodId: 'broccoli', amount: 200 }, { foodId: 'rice', amount: 100 }] },
    { kind: 'quick', name: '金枪鱼快手餐', badge: '方便快手', items: [{ foodId: 'tuna-water', amount: 120 }, { foodId: 'cucumber', amount: 150 }, { foodId: 'corn', amount: 100 }] },
  ],
  dinner: [
    { kind: 'balanced', name: '清爽护肝晚餐', badge: '均衡推荐', items: [{ foodId: 'cod', amount: 150 }, { foodId: 'broccoli', amount: 220 }, { foodId: 'chinese-yam', amount: 100 }] },
    { kind: 'quick', name: '魔芋鲜虾组合', badge: '方便快手', items: [{ foodId: 'shrimp', amount: 120 }, { foodId: 'konjac-noodles', amount: 200 }, { foodId: 'tomato', amount: 150 }] },
  ],
  snack: [
    { kind: 'balanced', name: '酸奶水果加餐', badge: '均衡推荐', items: [{ foodId: 'low-fat-yogurt', amount: 150 }, { foodId: 'apple', amount: 120 }] },
    { kind: 'quick', name: '牛奶坚果加餐', badge: '方便快手', items: [{ foodId: 'skim-milk', amount: 250 }, { foodId: 'almond', amount: 6 }] },
  ],
};

export function buildMiniMealRecommendations(input: {
  foods: FoodItem[];
  preferences: FoodPreference[];
  mealType: MealType;
  calorieBudget: number;
}): MiniMealRecommendation[] {
  if (input.calorieBudget < 80) return [];
  const foodMap = new Map(input.foods.map(food => [food.id, food]));
  const historyRecipe = buildHistoryRecipe(input.preferences, input.mealType, foodMap);
  const recipes = [...(historyRecipe ? [historyRecipe] : []), ...BASE_RECIPES[input.mealType]];
  const seen = new Set<string>();
  const recommendations: MiniMealRecommendation[] = [];

  for (const recipe of recipes) {
    const available = recipe.items.filter(item => foodMap.has(item.foodId));
    if (!available.length) continue;
    const signature = available.map(item => item.foodId).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const fitted = fitToBudget(available, foodMap, input.calorieBudget);
    const nutrition = fitted.reduce((total, item) => {
      const food = foodMap.get(item.foodId)!;
      const value = calculateFoodNutrition(food, item.amount);
      return { calories: total.calories + value.calories, protein: total.protein + value.protein };
    }, { calories: 0, protein: 0 });
    const template: MealTemplate = {
      id: `mini-${recipe.kind}-${input.mealType}`,
      name: recipe.name,
      description: fitted.map(item => {
        const food = foodMap.get(item.foodId)!;
        return `${food.name} ${formatAmount(item.amount, food)}`;
      }).join(' + '),
      items: fitted.map(item => ({ foodId: item.foodId, weightG: item.amount })),
      builtIn: true,
    };
    recommendations.push({
      template,
      calories: Math.round(nutrition.calories),
      protein: Math.round(nutrition.protein),
      badge: recipe.badge,
    });
    if (recommendations.length === 3) break;
  }
  return recommendations;
}

function buildHistoryRecipe(preferences: FoodPreference[], mealType: MealType, foodMap: Map<string, FoodItem>): Recipe | null {
  const sameMeal = preferences.filter(item => item.mealType === mealType && foodMap.has(item.foodId));
  const candidates = sameMeal.length ? sameMeal : preferences.filter(item => foodMap.has(item.foodId));
  if (!candidates.length) return null;
  const selected: FoodPreference[] = [];
  const addFirst = (test: (food: FoodItem) => boolean) => {
    const match = candidates.find(item => !selected.some(existing => existing.foodId === item.foodId) && test(foodMap.get(item.foodId)!));
    if (match) selected.push(match);
  };

  if (mealType === 'snack') {
    addFirst(food => SNACK_IDS.has(food.id) || food.calories <= 100);
    addFirst(food => PROTEIN_IDS.has(food.id) || food.protein >= 6);
  } else {
    addFirst(food => PROTEIN_IDS.has(food.id) || food.protein >= 8);
    addFirst(food => VEGETABLE_IDS.has(food.id) || (food.calories <= 70 && food.carb <= 15));
    addFirst(food => CARB_IDS.has(food.id) || (food.carb >= 15 && food.calories <= 350));
  }
  if (!selected.length) selected.push(candidates[0]);
  return {
    kind: 'history',
    name: '你的常吃搭配',
    badge: sameMeal.length ? '来自该餐历史偏好' : '来自历史偏好',
    items: selected.slice(0, 3).map(item => ({
      foodId: item.foodId,
      amount: clamp(roundToFive(item.averageAmount), 5, foodMap.get(item.foodId)?.nutritionUnit === 'ml' ? 500 : 300),
    })),
  };
}

function fitToBudget(items: Array<{ foodId: string; amount: number }>, foodMap: Map<string, FoodItem>, budget: number) {
  const calories = items.reduce((sum, item) => sum + calculateFoodNutrition(foodMap.get(item.foodId)!, item.amount).calories, 0);
  if (calories <= budget || calories <= 0) return items;
  const scale = budget / calories;
  return items.map(item => ({ ...item, amount: Math.max(5, roundToFive(item.amount * scale)) }));
}

function formatAmount(amount: number, food: FoodItem) {
  return `${Math.round(amount)}${food.nutritionUnit === 'ml' ? 'mL' : 'g'}`;
}

function roundToFive(value: number) {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
