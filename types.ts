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

export interface GroupMemberInput {
  id: string;
  name: string;
  weight: number;
  split: number;
  preference: string;
}

export interface GroupMenuPlanDish {
  name: string;
  description: string;
  estimatedPrice?: number;
}

export interface GroupMenuPlan {
  summary: string;
  dishes: GroupMenuPlanDish[];
  tips?: string;
}

export interface GroupMealRecordParticipant {
  name: string;
  score: number;
  comment?: string;
}

export interface GroupMealRecordMenuItem {
  dish: string;
  price: number;
  rating: number;
}

export interface GroupMealRecord {
  id: string;
  date: string;
  restaurant: string;
  totalPrice: number;
  participants: GroupMealRecordParticipant[];
  menuItems: GroupMealRecordMenuItem[];
  overallFeeling: string;
  averageScore: number;
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
