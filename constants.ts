import { DietGoal, Dish, UserProfile, DishCategory } from './types';

export const MACRO_CONFIG = {
  [DietGoal.MUSCLE_GAIN]: { protein: 1.8, carbs: 3.5, fat: 1.2 },
  [DietGoal.FAT_LOSS]: { protein: 2.0, carbs: 2.0, fat: 1.0 }, // Using a mid-point for simplicity
  [DietGoal.MAINTENANCE]: { protein: 1.5, carbs: 4.0, fat: 1.0 },
};

export const SATISFACTION_WEIGHTS = {
  nutrition: 0.4,
  preference: 0.3,
  history: 0.2,
  budget: 0.1,
};

export const MIN_SATISFACTION_SCORE = 85;

export const sampleDishes: Dish[] = [
  { id: 'd1', name: 'Grilled Chicken Breast Salad', restaurant: 'Healthy Eats', price: 12.5, protein: 40, carbs: 10, fat: 15, rating: 9, category: '蔬菜' },
  { id: 'd2', name: 'Brown Rice', restaurant: 'Healthy Eats', price: 3, protein: 5, carbs: 45, fat: 2, rating: 8, category: '主食' },
  { id: 'd3', name: 'Spicy Beef Noodles', restaurant: 'Noodle House', price: 15, protein: 30, carbs: 60, fat: 20, rating: 8, category: '主食' },
  { id: 'd4', name: 'Steamed Fish with Ginger', restaurant: 'Seafood Palace', price: 22, protein: 45, carbs: 5, fat: 18, rating: 10, category: '肉蛋' },
  { id: 'd5', name: 'Stir-fried Broccoli', restaurant: 'Seafood Palace', price: 8, protein: 4, carbs: 12, fat: 5, rating: 6, category: '蔬菜' },
  { id: 'd6', name: 'Avocado Toast', restaurant: 'Cafe Brunch', price: 10, protein: 10, carbs: 30, fat: 15, rating: 7, category: '主食' },
  { id: 'd7', name: 'Lentil Soup', restaurant: 'Cafe Brunch', price: 7, protein: 15, carbs: 35, fat: 4, rating: 7, category: '汤羹' },
  { id: 'd8', name: 'Quinoa Bowl with Veggies', restaurant: 'Healthy Eats', price: 14, protein: 18, carbs: 55, fat: 12, rating: 9, category: '主食' },
];

export const sampleUsers: UserProfile[] = [
    { id: 'u1', name: 'Alex', weightKg: 75, dietGoal: DietGoal.MUSCLE_GAIN, preferences: 'Loves spicy food, enjoys chicken and beef.', budget: 40 },
    { id: 'u2', name: 'Brenda', weightKg: 60, dietGoal: DietGoal.FAT_LOSS, preferences: 'Vegetarian, avoids greasy food, dislikes cilantro.', budget: 30 },
    { id: 'u3', name: 'Charlie', weightKg: 80, dietGoal: DietGoal.MAINTENANCE, preferences: 'Eats anything but dislikes very spicy food. Prefers fish over red meat.', budget: 50 },
];