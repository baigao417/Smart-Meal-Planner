import { UserProfile, Dish, Macros, MealRecommendation } from '../types';
import { MACRO_CONFIG, SATISFACTION_WEIGHTS, MIN_SATISFACTION_SCORE } from '../constants';
import { geminiService } from '../services/geminiService';

function calculateTargetMacros(profile: UserProfile): Macros {
  const config = MACRO_CONFIG[profile.dietGoal];
  return {
    protein: config.protein * profile.weightKg,
    carbs: config.carbs * profile.weightKg,
    fat: config.fat * profile.weightKg,
  };
}

function calculateNutritionScore(mealMacros: Macros, targetMacros: Macros): number {
  const proteinDiff = Math.abs(mealMacros.protein - targetMacros.protein) / (targetMacros.protein || 1);
  const carbsDiff = Math.abs(mealMacros.carbs - targetMacros.carbs) / (targetMacros.carbs || 1);
  const fatDiff = Math.abs(mealMacros.fat - targetMacros.fat) / (targetMacros.fat || 1);
  
  const totalError = (proteinDiff + carbsDiff + fatDiff) / 3;
  return Math.max(0, 100 * (1 - totalError * 1.5)); // Penalize deviation more heavily
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
            if (currentPrice + dish.price > budget * 1.2 || currentMacros.protein > targetMacros.protein * 1.2) {
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

    return candidates.filter(c => c.length > 0);
}

export async function findBestMeal(profile: UserProfile, dishes: Dish[]): Promise<MealRecommendation | null> {
  const targetMacros = calculateTargetMacros(profile);
  const mealCandidates = generateMealCandidates(dishes, targetMacros, profile.budget);
  
  if (mealCandidates.length === 0) return null;

  const preferenceScores = await geminiService.getBulkPreferenceScores(mealCandidates, profile);

  const scoredCandidates = mealCandidates.map((meal, index) => {
    const mealMacros: Macros = meal.reduce((acc, dish) => ({
      protein: acc.protein + dish.protein,
      carbs: acc.carbs + dish.carbs,
      fat: acc.fat + dish.fat,
    }), { protein: 0, carbs: 0, fat: 0 });
    
    const totalPrice = meal.reduce((sum, dish) => sum + dish.price, 0);

    const nutritionScore = calculateNutritionScore(mealMacros, targetMacros);
    const historyScore = calculateHistoryScore(meal);
    const budgetScore = calculateBudgetScore(totalPrice, profile.budget);
    const preferenceScore = preferenceScores[index]; // Use the score from the batch response

    const satisfactionScore = 
      nutritionScore * SATISFACTION_WEIGHTS.nutrition +
      preferenceScore * SATISFACTION_WEIGHTS.preference +
      historyScore * SATISFACTION_WEIGHTS.history +
      budgetScore * SATISFACTION_WEIGHTS.budget;

    return {
      dishes: meal,
      macros: mealMacros,
      totalPrice,
      satisfactionScore,
      warnings: checkMealWarnings(mealMacros, targetMacros),
    };
  });

  const validRecommendations = scoredCandidates.filter(c => c.satisfactionScore >= MIN_SATISFACTION_SCORE);

  if (validRecommendations.length === 0) return null;

  validRecommendations.sort((a, b) => b.satisfactionScore - a.satisfactionScore);
  const bestMeal = validRecommendations[0];
  
  const reasoning = await geminiService.generateRecommendationText(bestMeal, profile);

  return { ...bestMeal, reasoning };
}