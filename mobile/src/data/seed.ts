import { ActivityLevel, FoodItem, MealTemplate } from '../types';

export const MEAL_LABELS = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
} as const;

export const ACTIVITY_LEVELS: Array<{ value: ActivityLevel; label: string; factor: number }> = [
  { value: 'sedentary', label: '久坐少动', factor: 1.2 },
  { value: 'light', label: '轻度活动', factor: 1.375 },
  { value: 'moderate', label: '中度活动', factor: 1.55 },
  { value: 'active', label: '高强度活动', factor: 1.725 },
  { value: 'very_active', label: '非常活跃', factor: 1.9 },
];

export const COMMON_FOODS: FoodItem[] = [
  { id: 'rice', name: '熟米饭', calories: 116, protein: 2.6, fat: 0.3, carb: 25.9, isCommon: true },
  { id: 'brown-rice', name: '糙米饭', calories: 111, protein: 2.6, fat: 0.9, carb: 23, isCommon: true },
  { id: 'oats', name: '燕麦片', calories: 338, protein: 10.1, fat: 6.1, carb: 61.6, isCommon: true },
  { id: 'whole-wheat-bread', name: '全麦面包', calories: 246, protein: 9.9, fat: 4.2, carb: 44.5, isCommon: true },
  { id: 'sweet-potato', name: '蒸红薯', calories: 86, protein: 1.6, fat: 0.1, carb: 20.1, isCommon: true },
  { id: 'corn', name: '煮玉米', calories: 112, protein: 4, fat: 1.2, carb: 22.8, isCommon: true },
  { id: 'egg', name: '鸡蛋', calories: 144, protein: 13.3, fat: 8.8, carb: 2.8, isCommon: true },
  { id: 'chicken-breast', name: '鸡胸肉', calories: 133, protein: 24.6, fat: 2.5, carb: 0.6, isCommon: true },
  { id: 'skinless-drumstick', name: '去皮鸡腿', calories: 153, protein: 20.2, fat: 7.2, carb: 0, isCommon: true },
  { id: 'lean-pork', name: '瘦猪肉', calories: 143, protein: 20.3, fat: 6.2, carb: 1.5, isCommon: true },
  { id: 'beef', name: '瘦牛肉', calories: 125, protein: 20.1, fat: 4.2, carb: 0.2, isCommon: true },
  { id: 'salmon', name: '三文鱼', calories: 139, protein: 17.2, fat: 7.8, carb: 0, isCommon: true },
  { id: 'cod', name: '鳕鱼', calories: 88, protein: 20.4, fat: 0.5, carb: 0, isCommon: true },
  { id: 'shrimp', name: '虾仁', calories: 93, protein: 18.6, fat: 0.8, carb: 2.8, isCommon: true },
  { id: 'tofu', name: '北豆腐', calories: 116, protein: 9.2, fat: 8.1, carb: 3, isCommon: true },
  { id: 'soy-milk', name: '无糖豆浆', calories: 31, protein: 3, fat: 1.6, carb: 1.2, isCommon: true },
  { id: 'milk', name: '低脂牛奶', calories: 43, protein: 3.2, fat: 1.3, carb: 4.8, isCommon: true },
  { id: 'yogurt', name: '无糖酸奶', calories: 63, protein: 3.8, fat: 3.2, carb: 4.8, isCommon: true },
  { id: 'bok-choy', name: '清炒青菜', calories: 62, protein: 2.1, fat: 4.2, carb: 4.1, isCommon: true },
  { id: 'broccoli', name: '水煮西兰花', calories: 34, protein: 4.1, fat: 0.6, carb: 4.3, isCommon: true },
  { id: 'cucumber', name: '黄瓜', calories: 16, protein: 0.8, fat: 0.2, carb: 2.9, isCommon: true },
  { id: 'tomato', name: '番茄', calories: 15, protein: 0.9, fat: 0.2, carb: 3.3, isCommon: true },
  { id: 'spinach', name: '菠菜', calories: 23, protein: 2.6, fat: 0.3, carb: 4.5, isCommon: true },
  { id: 'mushroom', name: '香菇', calories: 26, protein: 2.2, fat: 0.3, carb: 5.2, isCommon: true },
  { id: 'apple', name: '苹果', calories: 53, protein: 0.4, fat: 0.2, carb: 13.7, isCommon: true },
  { id: 'orange', name: '橙子', calories: 48, protein: 0.8, fat: 0.2, carb: 11.1, isCommon: true },
  { id: 'blueberry', name: '蓝莓', calories: 57, protein: 0.7, fat: 0.3, carb: 14.5, isCommon: true },
  { id: 'banana', name: '香蕉', calories: 93, protein: 1.4, fat: 0.2, carb: 22, isCommon: true },
  { id: 'walnut', name: '核桃仁', calories: 646, protein: 14.9, fat: 58.8, carb: 19.1, isCommon: true },
  { id: 'almond', name: '巴旦木', calories: 578, protein: 21.3, fat: 50.6, carb: 19.7, isCommon: true },
].map(item => ({ ...item, ownerId: null }));

export const BUILT_IN_TEMPLATES: MealTemplate[] = [
  {
    id: 'tpl-canteen',
    name: '食堂减脂餐',
    description: '半碗米饭 + 去皮鸡腿 + 青菜',
    items: [
      { foodId: 'rice', weightG: 100 },
      { foodId: 'skinless-drumstick', weightG: 150 },
      { foodId: 'bok-choy', weightG: 200 },
    ],
    builtIn: true,
  },
  {
    id: 'tpl-breakfast',
    name: '高蛋白早餐',
    description: '燕麦 + 鸡蛋 + 无糖豆浆',
    items: [
      { foodId: 'oats', weightG: 40 },
      { foodId: 'egg', weightG: 50 },
      { foodId: 'soy-milk', weightG: 250 },
    ],
    builtIn: true,
  },
  {
    id: 'tpl-light-dinner',
    name: '清爽晚餐',
    description: '鳕鱼 + 西兰花 + 红薯',
    items: [
      { foodId: 'cod', weightG: 180 },
      { foodId: 'broccoli', weightG: 250 },
      { foodId: 'sweet-potato', weightG: 120 },
    ],
    builtIn: true,
  },
];

export const EXERCISES = [
  { name: '快走', met: 4 },
  { name: '慢跑', met: 8 },
  { name: '骑行', met: 6.8 },
  { name: '游泳', met: 7 },
  { name: '跳绳', met: 10 },
  { name: '力量训练', met: 5 },
  { name: '瑜伽', met: 2.8 },
];
