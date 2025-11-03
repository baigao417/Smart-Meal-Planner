import React, { useState, useCallback } from 'react';
import { UserProfile, Dish, MealRecommendation } from '../types';
import { findBestMeal } from '../lib/recommendation';
import RecommendationCard from './RecommendationCard';
import { SparklesIcon, ArrowPathIcon } from './Icons';

interface DailyRecommenderProps {
  profile: UserProfile;
  dishes: Dish[];
}

const LoadingSpinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center space-y-4 p-8">
        <ArrowPathIcon className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="text-gray-600 font-medium text-lg">Finding the perfect meal for you...</p>
    </div>
);

const NoResult: React.FC = () => (
    <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
        <h3 className="text-2xl font-bold text-gray-800 mb-3">No suitable meal found!</h3>
        <p className="text-gray-600 max-w-md mx-auto">We couldn't find a meal that meets the high satisfaction score (>85) with your current settings.</p>
        <div className="mt-6 text-left max-w-md mx-auto space-y-2 text-gray-500">
            <p>To improve your results, you could:</p>
            <ul className="list-disc list-inside space-y-1">
                <li>Increase your daily budget in your profile.</li>
                <li>Add more diverse dishes to your "My Dishes" list.</li>
                <li>Adjust your preferences to be less restrictive.</li>
            </ul>
        </div>
    </div>
);

const InitialStatePrompt: React.FC = () => (
    <div className="text-center bg-white p-8 rounded-2xl shadow-lg animate-fade-in">
        <SparklesIcon className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-gray-800 mb-3">Your Meal Plan Awaits</h3>
        <p className="text-gray-600 max-w-md mx-auto">
            Click the button above to get your personalized meal recommendation, tailored to your goals and preferences.
        </p>
    </div>
);

const DailyRecommender: React.FC<DailyRecommenderProps> = ({ profile, dishes }) => {
  const [recommendation, setRecommendation] = useState<MealRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const getRecommendation = useCallback(async () => {
    setIsLoading(true);
    setHasSearched(true);
    setError(null);
    setRecommendation(null);
    try {
      const bestMeal = await findBestMeal(profile, dishes);
      setRecommendation(bestMeal);
    } catch (err) {
      console.error(err);
      setError("An error occurred while fetching your recommendation.");
    } finally {
      setIsLoading(false);
    }
  }, [profile, dishes]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
        <div>
            <h2 className="text-3xl font-bold text-gray-900">Today's Recommendation</h2>
            <p className="text-gray-600 mt-1">Your personalized meal plan, designed for efficiency and wellness.</p>
        </div>
        <button
          onClick={getRecommendation}
          disabled={isLoading}
          className="mt-4 sm:mt-0 flex items-center justify-center px-5 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-300 ease-in-out disabled:bg-indigo-400 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <SparklesIcon className="w-5 h-5 mr-2" />
              {hasSearched ? 'Generate New' : "Get Today's Meal"}
            </>
          )}
        </button>
      </div>
      
      {isLoading && <LoadingSpinner />}
      {error && <div className="text-center text-red-500 bg-red-100 p-4 rounded-lg">{error}</div>}
      {!isLoading && !error && (
        !hasSearched ? (
            <InitialStatePrompt />
        ) : recommendation ? (
            <RecommendationCard recommendation={recommendation} />
        ) : (
            <NoResult />
        )
      )}
    </div>
  );
};

export default DailyRecommender;