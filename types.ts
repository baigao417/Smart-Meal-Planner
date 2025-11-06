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

export type BudgetMode = 'balanced' | 'saver' | 'enjoy';

export interface UserProfile {
  id: string;
  name:string;
  weightKg: number;
  dietGoal: DietGoal;
  preferences: string; // e.g., "loves spicy, hates seafood"
  budget: number; // Daily budget
  mealsPerDay?: number;
  budgetMode?: BudgetMode;
  averageDecisionMinutes?: number;
  email?: string;
  syncEnabled?: boolean;
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
    id: string;
    userId?: string;
    name: string;
    weight: number; // Weight for recommendation algorithm
    customPreferences?: string;
    shareRatio?: number;
    personalScore?: number;
    notes?: string;
}

export interface SyncedUserData {
  profile: UserProfile | null;
  dishes: Dish[];
  allUsers: UserProfile[];
  groupMeals?: GroupMealRecord[];
  dailyPlans?: DailyPlanRecord[];
  timeSavedMinutes?: number;
  updatedAt: string;
}

export type CloudSyncProvider = 'vercel-kv' | 'webdav';

export interface CloudSyncStatus {
  available: boolean;
  provider?: CloudSyncProvider;
  hint?: string;
}

export interface GroupMealParticipantRecord {
  id: string;
  groupMealId: string;
  userId?: string;
  name: string;
  shareRatio: number;
  personalScore?: number;
  notes?: string;
}

export interface SharedDishInfo {
  name: string;
  calories?: number;
  shareRatio?: number;
}

export interface GroupMealRecord {
  id: string;
  date: string;
  restaurant: string;
  totalPrice: number;
  sharedDishes: SharedDishInfo[];
  totalScore?: number;
  createdBy: string;
  participants: GroupMealParticipantRecord[];
  notes?: string;
}

export interface DailyMealSlotPlan {
  slot: string;
  budget: number;
  recommendation: MealRecommendation | null;
}

export interface DailyPlanRecord {
  id: string;
  date: string;
  mode: BudgetMode;
  budget: number;
  mealsPerDay: number;
  slots: DailyMealSlotPlan[];
  totalSpent: number;
  totalSatisfaction: number;
  macros: Macros;
}
