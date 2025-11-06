import {
  UserProfile,
  Dish,
  Macros,
  MealRecommendation,
  BudgetMode,
  DailyPlanRecord,
  DailyMealSlotPlan,
  DietGoal,
} from '../types';
import { MACRO_CONFIG, MIN_SATISFACTION_SCORE, SCENARIO_WEIGHTS, ScenarioKey } from '../constants';
import { siliconflowService } from '../services/siliconflowService';

function calculateTargetMacros(profile: UserProfile): Macros {
  const config = MACRO_CONFIG[profile.dietGoal];
  return {
    protein: config.protein * profile.weightKg,
    carbs: config.carbs * profile.weightKg,
    fat: config.fat * profile.weightKg,
  };
}

const RECENT_REPEAT_DAYS = 3;

function calculateNutritionScore(mealMacros: Macros, targetMacros: Macros): number {
  const proteinDiff = Math.abs(mealMacros.protein - targetMacros.protein) / (targetMacros.protein || 1);
  const carbsDiff = Math.abs(mealMacros.carbs - targetMacros.carbs) / (targetMacros.carbs || 1);
  const fatDiff = Math.abs(mealMacros.fat - targetMacros.fat) / (targetMacros.fat || 1);

  const totalError = (proteinDiff + carbsDiff + fatDiff) / 3;
  return Math.max(0, 100 * (1 - totalError * 1.5)); // Penalize deviation more heavily
}

function calculateDiversityScore(meal: Dish[]): number {
  if (meal.length <= 1) {
    return meal.length === 1 ? 60 : 0;
  }

  const categorySet = new Set(meal.map((dish) => dish.category));
  const restaurantSet = new Set(meal.map((dish) => dish.restaurant));

  const categoryRatio = categorySet.size / meal.length;
  const restaurantRatio = restaurantSet.size / meal.length;

  return Math.round(((categoryRatio + restaurantRatio) / 2) * 100);
}

function calculateHistoryScore(dishes: Dish[]): number {
  if (dishes.length === 0) return 0;
  const totalRating = dishes.reduce((sum, dish) => sum + dish.rating, 0);
  const avgRating = totalRating / dishes.length;
  return (avgRating / 10) * 100;
}

function calculateBudgetScore(totalPrice: number, budget: number): number {
  if (totalPrice > budget) {
    const overflow = (totalPrice - budget) / budget;
    return Math.max(0, 100 - overflow * 200); // Heavy penalty for going over budget
  }
  return 100;
}

function isDishWithinBudget(dish: Dish, budget: number): boolean {
  return dish.price <= budget * 1.3;
}

function isDishAlignedWithGoal(dish: Dish, goal: DietGoal): boolean {
  switch (goal) {
    case DietGoal.FAT_LOSS:
      return !(dish.fat > 30 && dish.carbs > 60);
    case DietGoal.MUSCLE_GAIN:
      return dish.protein >= 20;
    default:
      return true;
  }
}

function isDishRecentlyRepeated(dish: Dish): boolean {
  if (!dish.lastEaten) return false;
  const last = new Date(dish.lastEaten).getTime();
  if (Number.isNaN(last)) return false;
  const diff = Date.now() - last;
  const threshold = RECENT_REPEAT_DAYS * 24 * 60 * 60 * 1000;
  return diff < threshold;
}

function filterDishesForProfile(dishes: Dish[], profile: UserProfile, budget: number): Dish[] {
  const filtered = dishes.filter(
    (dish) => isDishWithinBudget(dish, budget) && isDishAlignedWithGoal(dish, profile.dietGoal) && !isDishRecentlyRepeated(dish)
  );

  if (filtered.length > 0) {
    return filtered;
  }

  // If hard filters remove everything, relax goal/recent checks but keep budget guardrails.
  return dishes.filter((dish) => isDishWithinBudget(dish, budget));
}

function resolveScenario(profile: UserProfile, options: MealSearchOptions): ScenarioKey {
  if (options.scenario) {
    return options.scenario;
  }
  if (options.budgetMode === 'saver' || profile.budgetMode === 'saver') {
    return 'fired';
  }
  switch (profile.dietGoal) {
    case DietGoal.FAT_LOSS:
      return 'fat-loss';
    case DietGoal.MUSCLE_GAIN:
      return 'muscle-gain';
    default:
      return 'maintenance';
  }
}

function checkMealWarnings(mealMacros: Macros, targetMacros: Macros): string[] {
    const warnings: string[] = [];
    const thresholds = { protein: 0.2, carbs: 0.2, fat: 0.25 };
    
    if (mealMacros.protein < targetMacros.protein * (1 - thresholds.protein)) warnings.push('Protein is low');
    if (mealMacros.carbs > targetMacros.carbs * (1 + thresholds.carbs)) warnings.push('Carbs are high');
    if (mealMacros.carbs < targetMacros.carbs * (1 - thresholds.carbs)) warnings.push('Carbs are low');
    if (mealMacros.fat > targetMacros.fat * (1 + thresholds.fat)) warnings.push('Fat is high');

    return warnings;
}

// Simple heuristic to generate meal candidates
function generateMealCandidates(dishes: Dish[], targetMacros: Macros, budget: number): Dish[][] {
    const candidates: Dish[][] = [];
    const sortedDishes = [...dishes].sort(() => 0.5 - Math.random());
    
    // Attempt to build 50 candidates
    for (let i = 0; i < 50; i++) {
        const currentMeal: Dish[] = [];
        let currentMacros: Macros = { protein: 0, carbs: 0, fat: 0 };
        let currentPrice = 0;
        
        const shuffledDishes = [...sortedDishes].sort(() => 0.5 - Math.random());
        
        for (const dish of shuffledDishes) {
            // Stop if meal is getting too large or expensive
            if (currentPrice + dish.price > budget * 1.3 || currentMacros.protein > targetMacros.protein * 1.2) {
                continue;
            }
            // Add variety
            if (currentMeal.length > 0 && currentMeal.some(d => d.category === dish.category && dish.category !== '其他')) {
                if (Math.random() > 0.6) continue; // 40% chance to skip same category
            }

            currentMeal.push(dish);
            currentPrice += dish.price;
            currentMacros.protein += dish.protein;
            currentMacros.carbs += dish.carbs;
            currentMacros.fat += dish.fat;

            if(currentMeal.length > 0) candidates.push([...currentMeal]);
            if (currentMeal.length >= 4) break;
        }
    }
    // Ensure we have at least some single-dish options
    dishes.forEach(d => candidates.push([d]));

    return candidates
      .filter((c) => c.length > 0)
      .filter((meal) => meal.reduce((sum, dish) => sum + dish.price, 0) <= budget * 1.3);
}

export type MealScenario = ScenarioKey;

export type MealSearchOptions = {
  budgetOverride?: number;
  excludeDishIds?: Set<string>;
  scenario?: MealScenario;
  budgetMode?: BudgetMode;
};

export async function findBestMeal(
  profile: UserProfile,
  dishes: Dish[],
  options: MealSearchOptions = {}
): Promise<MealRecommendation | null> {
  const effectiveBudget = options.budgetOverride ?? profile.budget;
  const targetMacros = calculateTargetMacros(profile);
  const filteredDishes = options.excludeDishIds
    ? dishes.filter((dish) => !options.excludeDishIds?.has(dish.id))
    : dishes;
  const prescreened = filterDishesForProfile(filteredDishes, profile, effectiveBudget);
  const mealCandidates = generateMealCandidates(prescreened, targetMacros, effectiveBudget);

  if (mealCandidates.length === 0) return null;

  const preferenceScores = await siliconflowService.getBulkPreferenceScores(mealCandidates, profile);

  const scenario = resolveScenario(profile, options);
  const weights = SCENARIO_WEIGHTS[scenario];

  const scoredCandidates = mealCandidates.map((meal, index) => {
    const mealMacros: Macros = meal.reduce((acc, dish) => ({
      protein: acc.protein + dish.protein,
      carbs: acc.carbs + dish.carbs,
      fat: acc.fat + dish.fat,
    }), { protein: 0, carbs: 0, fat: 0 });

    const totalPrice = meal.reduce((sum, dish) => sum + dish.price, 0);

    const nutritionScore = calculateNutritionScore(mealMacros, targetMacros);
    const historyScore = calculateHistoryScore(meal);
    const budgetScore = calculateBudgetScore(totalPrice, effectiveBudget);
    const preferenceScore = preferenceScores[index] ?? 50;
    const diversityScore = calculateDiversityScore(meal);

    const satisfactionScore =
      nutritionScore * weights.nutrition +
      preferenceScore * weights.preference +
      historyScore * weights.history +
      budgetScore * weights.budget +
      diversityScore * weights.diversity;

    return {
      dishes: meal,
      macros: mealMacros,
      totalPrice,
      satisfactionScore,
      warnings: checkMealWarnings(mealMacros, targetMacros),
    };
  });

  const sortedCandidates = [...scoredCandidates].sort((a, b) => b.satisfactionScore - a.satisfactionScore);
  if (sortedCandidates.length === 0) {
    return null;
  }

  const bestMeal =
    sortedCandidates.find((candidate) => candidate.satisfactionScore >= MIN_SATISFACTION_SCORE) ??
    sortedCandidates[0];

  const needsThresholdWarning = bestMeal.satisfactionScore < MIN_SATISFACTION_SCORE;
  const reasoning = await siliconflowService.generateRecommendationText(bestMeal, profile);
  const warnings = needsThresholdWarning
    ? [
        ...bestMeal.warnings,
        `当前组合的满意度约为 ${Math.round(bestMeal.satisfactionScore)}，低于建议阈值 ${MIN_SATISFACTION_SCORE}。可考虑增加预算或补充菜品。`,
      ]
    : bestMeal.warnings;

  return { ...bestMeal, reasoning, warnings };
}

const SLOT_LABELS: Record<number, string[]> = {
  2: ['Breakfast / Brunch', 'Dinner'],
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Afternoon', 'Dinner'],
};

const SLOT_WEIGHTS: Record<number, number[]> = {
  2: [0.45, 0.55],
  3: [0.25, 0.4, 0.35],
  4: [0.2, 0.3, 0.2, 0.3],
};

const BUDGET_MODE_MULTIPLIER: Record<BudgetMode, number> = {
  balanced: 1,
  saver: 0.85,
  enjoy: 1.1,
};

function getSlotLabels(mealsPerDay: number): string[] {
  return SLOT_LABELS[mealsPerDay] ?? Array.from({ length: mealsPerDay }, (_, index) => `Meal ${index + 1}`);
}

function getSlotWeights(mealsPerDay: number): number[] {
  const weights = SLOT_WEIGHTS[mealsPerDay];
  if (weights && Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 0.001) {
    return weights;
  }
  const equal = 1 / mealsPerDay;
  return Array.from({ length: mealsPerDay }, () => equal);
}

function mergeMacros(target: Macros, addition: Macros): Macros {
  return {
    protein: target.protein + addition.protein,
    carbs: target.carbs + addition.carbs,
    fat: target.fat + addition.fat,
  };
}

export async function generateDailyPlan(
  profile: UserProfile,
  dishes: Dish[],
  mode: BudgetMode,
  mealsPerDay: number
): Promise<DailyPlanRecord> {
  const requestedMeals = Number.isFinite(mealsPerDay) ? Math.round(mealsPerDay) : 3;
  const normalizedMeals = Math.max(1, Math.min(6, requestedMeals || 3));
  const labels = getSlotLabels(normalizedMeals);
  const weights = getSlotWeights(normalizedMeals);
  const multiplier = BUDGET_MODE_MULTIPLIER[mode] ?? 1;
  const adjustedBudget = profile.budget * multiplier;

  const usedDishIds = new Set<string>();
  const slots: DailyMealSlotPlan[] = [];

  for (let index = 0; index < normalizedMeals; index += 1) {
    const slotBudget = adjustedBudget * (weights[index] ?? 1 / normalizedMeals);
    const recommendation = await findBestMeal(profile, dishes, {
      budgetOverride: slotBudget,
      excludeDishIds: usedDishIds,
      budgetMode: mode,
    });
    if (recommendation) {
      recommendation.dishes.forEach((dish) => usedDishIds.add(dish.id));
    }
    slots.push({ slot: labels[index] ?? `Meal ${index + 1}`, budget: slotBudget, recommendation });
  }

  const totals = slots.reduce(
    (acc, slot) => {
      if (!slot.recommendation) {
        return acc;
      }
      return {
        macros: mergeMacros(acc.macros, slot.recommendation.macros),
        spent: acc.spent + slot.recommendation.totalPrice,
        satisfaction: acc.satisfaction + slot.recommendation.satisfactionScore,
        counted: acc.counted + 1,
      };
    },
    {
      macros: { protein: 0, carbs: 0, fat: 0 },
      spent: 0,
      satisfaction: 0,
      counted: 0,
    }
  );

  const plan: DailyPlanRecord = {
    id: `plan-${Date.now()}`,
    date: new Date().toISOString(),
    mode,
    budget: adjustedBudget,
    mealsPerDay: normalizedMeals,
    slots,
    totalSpent: Number(totals.spent.toFixed(2)),
    totalSatisfaction: totals.counted > 0 ? totals.satisfaction / totals.counted : 0,
    macros: {
      protein: Math.round(totals.macros.protein),
      carbs: Math.round(totals.macros.carbs),
      fat: Math.round(totals.macros.fat),
    },
  };

  return plan;
}