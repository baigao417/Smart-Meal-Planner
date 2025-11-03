import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, Dish, Macros } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. Using a placeholder. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "YOUR_API_KEY_HERE" });

class GeminiService {
  async getPreferenceScore(dishes: Dish[], profile: UserProfile): Promise<number> {
    // This is kept for potential single-meal scoring in the future, but the main recommender will use the bulk version.
    if (!API_KEY) return 80;
    const scores = await this.getBulkPreferenceScores([dishes], profile);
    return scores[0] || 70;
  }

  async getBulkPreferenceScores(meals: Dish[][], profile: UserProfile): Promise<number[]> {
    if (!API_KEY || meals.length === 0) return meals.map(() => 80);

    const mealListString = meals.map((meal, index) =>
      `Meal ${index + 1}: [${meal.map(d => d.name).join(', ')}]`
    ).join('\n');

    const prompt = `A user has the following food preferences: "${profile.preferences}".
Based on these preferences, score each of the following meals on a scale of 0 to 100 for how much the user would enjoy them.

${mealListString}

Respond with a JSON object containing a single key "scores" which is an array of integers. The array should have exactly ${meals.length} numbers, corresponding to each meal in the order provided.`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        scores: {
                            type: Type.ARRAY,
                            items: { type: Type.NUMBER }
                        }
                    },
                    required: ['scores']
                }
            }
        });

        const result = JSON.parse(response.text);
        const scores = result.scores;
        if (Array.isArray(scores) && scores.length === meals.length) {
            return scores.map(s => Math.max(0, Math.min(100, s)));
        }
        console.error("Mismatched scores length from AI, fallback to 75 for all.");
        return meals.map(() => 75);
    } catch (error) {
        console.error("Error getting bulk preference scores:", error);
        return meals.map(() => 70);
    }
  }

  async generateRecommendationText(meal: { dishes: Dish[], macros: Macros }, profile: UserProfile): Promise<string> {
    if (!API_KEY) return "A delicious and well-balanced meal option for you.";
    try {
      const dishList = meal.dishes.map(d => `- ${d.name} from ${d.restaurant}`).join('\n');
      const prompt = `A user's goal is "${profile.dietGoal}". Their recommended meal is:\n${dishList}\n\nThis meal has ${Math.round(meal.macros.protein)}g protein, ${Math.round(meal.macros.carbs)}g carbs, and ${Math.round(meal.macros.fat)}g fat.
      
      Briefly explain in a friendly and encouraging tone why this is a good choice for their goal. The user follows the FIRE philosophy (Financial Independence, Retire Early), so emphasize how automating this decision saves them time and mental energy for more important things. Keep it concise (2-3 sentences).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      return response.text;
    } catch (error) {
      console.error("Error generating recommendation text:", error);
      return "This meal is a great choice to help you meet your daily nutritional goals and stay on track!";
    }
  }

  async generateGroupRecommendationText(meal: { dishes: Dish[] }, participants: { user: UserProfile, weight: number }[]): Promise<string> {
    if (!API_KEY) return "A great choice that should satisfy everyone in the group.";
    try {
        const dishList = meal.dishes.map(d => d.name).join(', ');
        const participantPrefs = participants.map(p => `- ${p.user.name} (weight: ${p.weight}): ${p.user.preferences}`).join('\n');

        const prompt = `A group meal is being planned for the following people with their preferences:\n${participantPrefs}\n\nThe recommended meal consists of: ${dishList}.
        
        Please provide a brief, friendly summary explaining why this meal is a good compromise for the group, mentioning how it accommodates different key preferences (e.g., "avoids seafood for X," "has spicy options for Y").`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error generating group recommendation text:", error);
        return "This meal selection balances the preferences of the group, offering something for everyone.";
    }
  }

  async estimateDishMacros(dishName: string, restaurantName: string): Promise<Macros> {
    if (!API_KEY) {
      console.warn("API key not set. Using fallback for macro estimation.");
      return { protein: 25, carbs: 45, fat: 18 }; // Fallback data
    }

    const prompt = `Provide a realistic nutritional estimate (protein, carbs, and fat in grams) for a standard single serving of the following dish.
Dish: "${dishName}"
Restaurant: "${restaurantName}"
Consider common ingredients and preparation methods. Respond ONLY with the JSON object.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fat: { type: Type.NUMBER },
            },
            required: ['protein', 'carbs', 'fat'],
          },
        },
      });

      const result = JSON.parse(response.text);
      if (result.protein !== undefined && result.carbs !== undefined && result.fat !== undefined) {
        return result as Macros;
      }
      throw new Error("Invalid response structure from AI.");
    } catch (error) {
      console.error("Error estimating dish macros:", error);
      throw new Error("AI estimation failed. Please enter macros manually.");
    }
  }

  async parseDishesFromText(text: string): Promise<Partial<Dish>[]> {
    if (!API_KEY) {
      console.warn("API key not set. Cannot parse dishes.");
      return [
        { name: 'Parsed Noodle Soup', restaurant: 'Imported Cafe', price: 25, protein: 20, carbs: 40, fat: 10, category: '主食' },
        { name: 'Parsed Chicken Salad', restaurant: 'Imported Cafe', price: 30, protein: 35, carbs: 10, fat: 15, category: '蔬菜' },
      ];
    }

    const prompt = `Parse the following list of meals from a text file. Each line is a separate item. For each item, extract the dish name, restaurant, and price (in CNY).

If a restaurant is not explicitly mentioned, infer it from context or use "Local Eatery".
If a price is not mentioned, estimate a reasonable price for a single serving in China.
Also, provide an estimated nutritional breakdown (protein, carbs, fat in grams) for a standard portion of each dish.
Finally, categorize each dish into one of these types: '主食', '肉蛋', '蔬菜', '汤羹', '其他'.

The user is a college student, so portions and prices should reflect that.

Text to parse:
---
${text}
---
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                restaurant: { type: Type.STRING },
                price: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fat: { type: Type.NUMBER },
                category: {
                  type: Type.STRING,
                  enum: ['主食', '肉蛋', '蔬菜', '汤羹', '其他']
                },
              },
              required: ['name', 'restaurant', 'price', 'protein', 'carbs', 'fat', 'category']
            },
          },
        },
      });

      const parsedJson = JSON.parse(response.text.trim());
      if (Array.isArray(parsedJson)) {
        return parsedJson as Partial<Dish>[];
      }
      return [];

    } catch (error) {
      console.error("Error parsing dishes from text:", error);
      throw new Error("Failed to parse dishes using AI. Please check the file format.");
    }
  }
}

export const geminiService = new GeminiService();