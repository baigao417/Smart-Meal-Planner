export enum DietGoal {
  FAT_LOSS = '减脂 (Fat Loss)',
  MUSCLE_GAIN = '增肌 (Muscle Gain)',
  MAINTENANCE = '日常 (Maintenance)',
}

export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

export interface UserProfile {
  id: string;
  name:string;
  weightKg: number;
  dietGoal: DietGoal;
  preferences: string; // e.g., "loves spicy, hates seafood"
  budget: number; // Daily budget
}

export type DishCategory = '主食' | '肉蛋' | '蔬菜' | '汤羹' | '其他';

export interface Dish {
  id: string;
  name: string;
  restaurant: string;
  price: number;
  protein: number;
  carbs: number;
  fat: number;
  rating: number; // 1-10
  category: DishCategory;
  lastEaten?: string; // ISO date string
}

export interface MealRecommendation {
  dishes: Dish[];
  totalPrice: number;
  macros: Macros;
  satisfactionScore: number;
  reasoning: string;
  warnings: string[];
}

export interface GroupParticipant {
    userId: string;
    weight: number; // Weight for recommendation algorithm
}