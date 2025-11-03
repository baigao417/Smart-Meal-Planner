
import React, { useState, useCallback } from 'react';
import { UserProfile, Dish, GroupParticipant, MealRecommendation } from '../types';
import { geminiService } from '../services/geminiService';
import RecommendationCard from './RecommendationCard';
import { UserGroupIcon, ArrowPathIcon } from './Icons';

interface GroupRecommenderProps {
  allUsers: UserProfile[];
  dishes: Dish[];
  currentUser: UserProfile;
}

// Simplified Group Recommendation Logic (client-side)
async function findBestGroupMeal(participants: {user: UserProfile, weight: number}[], dishes: Dish[]): Promise<MealRecommendation | null> {
    if (participants.length === 0 || dishes.length === 0) return null;
    
    // This is a simplified placeholder. A real implementation would involve a more complex algorithm.
    // For this demo, we'll pick a few random, highly-rated dishes and get an AI-generated reason.
    const candidates = dishes.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    const meal: { dishes: Dish[], macros: any, totalPrice: number } = {
        dishes: candidates,
        macros: candidates.reduce((acc, d) => ({
            protein: acc.protein + d.protein,
            carbs: acc.carbs + d.carbs,
            fat: acc.fat + d.fat,
        }), { protein: 0, carbs: 0, fat: 0 }),
        totalPrice: candidates.reduce((sum, d) => sum + d.price, 0)
    };

    const reasoning = await geminiService.generateGroupRecommendationText(meal, participants);

    return {
        ...meal,
        satisfactionScore: 90, // Placeholder score for group
        warnings: [],
        reasoning: reasoning,
    };
}


const GroupRecommender: React.FC<GroupRecommenderProps> = ({ allUsers, dishes, currentUser }) => {
  const [participants, setParticipants] = useState<GroupParticipant[]>([{ userId: currentUser.id, weight: 1.0 }]);
  const [recommendation, setRecommendation] = useState<MealRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleParticipantChange = (index: number, userId: string) => {
    const newParticipants = [...participants];
    newParticipants[index] = { ...newParticipants[index], userId };
    setParticipants(newParticipants);
  };
  
  const handleWeightChange = (index: number, weight: number) => {
    const newParticipants = [...participants];
    newParticipants[index] = { ...newParticipants[index], weight: Math.max(0.1, weight) };
    setParticipants(newParticipants);
  };

  const addParticipant = () => {
    const availableUser = allUsers.find(u => !participants.some(p => p.userId === u.id));
    if (availableUser) {
        setParticipants([...participants, { userId: availableUser.id, weight: 1.0 }]);
    }
  };

  const removeParticipant = (index: number) => {
    if(participants.length > 1) {
        setParticipants(participants.filter((_, i) => i !== index));
    }
  };

  const getRecommendation = useCallback(async () => {
    setIsLoading(true);
    setRecommendation(null);
    const fullParticipants = participants.map(p => ({
        user: allUsers.find(u => u.id === p.userId)!,
        weight: p.weight
    })).filter(p => p.user);

    const result = await findBestGroupMeal(fullParticipants, dishes);
    setRecommendation(result);
    setIsLoading(false);
  }, [participants, allUsers, dishes]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Group Meal Mode</h2>
          <p className="text-gray-600 mt-1">Find a meal that everyone can enjoy.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-lg mb-8">
        <h3 className="font-bold text-xl mb-4 text-gray-800">Plan Your Group Meal</h3>
        <div className="space-y-4">
            {participants.map((p, index) => (
                <div key={index} className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <select value={p.userId} onChange={(e) => handleParticipantChange(index, e.target.value)} className="w-full sm:w-1/2 p-2 border border-gray-300 rounded-md bg-white">
                        {allUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                    <div className="flex items-center w-full sm:w-1/2">
                        <label className="text-sm mr-2 text-gray-600">Weight:</label>
                        <input type="number" value={p.weight} onChange={e => handleWeightChange(index, parseFloat(e.target.value))} min="0.1" step="0.1" className="w-20 p-2 border border-gray-300 rounded-md"/>
                        <button onClick={() => removeParticipant(index)} className="ml-auto text-gray-500 hover:text-red-600 p-2">&times;</button>
                    </div>
                </div>
            ))}
        </div>
        <button onClick={addParticipant} className="mt-4 text-indigo-600 font-semibold text-sm">+ Add Person</button>
      </div>

      <div className="text-center">
        <button
          onClick={getRecommendation}
          disabled={isLoading}
          className="flex items-center justify-center w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-300 ease-in-out disabled:bg-indigo-400"
        >
          {isLoading ? (
            <ArrowPathIcon className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <UserGroupIcon className="w-6 h-6 mr-2" />
              Find Group Meal
            </>
          )}
        </button>
      </div>
      
      {isLoading && <div className="text-center mt-8">Finding a meal for the group...</div>}
      {recommendation && (
        <div className="mt-8">
            <h3 className="text-2xl font-bold mb-4 text-center">Group Recommendation</h3>
            <RecommendationCard recommendation={recommendation} />
        </div>
      )}
    </div>
  );
};

export default GroupRecommender;
