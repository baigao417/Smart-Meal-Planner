
import React from 'react';
import { MealRecommendation } from '../types';

interface RecommendationCardProps {
  recommendation: MealRecommendation;
}

const MacroPill: React.FC<{ label: string; value: number; unit: string; color: string }> = ({ label, value, unit, color }) => (
    <div className={`flex flex-col items-center justify-center p-3 rounded-lg text-center ${color}`}>
        <span className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</span>
        <span className="text-xl font-bold">{Math.round(value)}{unit}</span>
    </div>
);

const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  const { dishes, totalPrice, macros, satisfactionScore, reasoning, warnings } = recommendation;
  const restaurants = [...new Set(dishes.map(d => d.restaurant))];

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row justify-between md:items-start">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">{restaurants.join(' & ')}</h3>
            <p className="text-indigo-600 font-semibold text-lg mt-1">￥{totalPrice.toFixed(2)}</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center bg-green-100 text-green-800 rounded-full px-4 py-2">
            <span className="text-sm font-semibold">Satisfaction Score</span>
            <span className="text-lg font-bold ml-2">{Math.round(satisfactionScore)}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Meal Items</h4>
          <ul className="space-y-3">
            {dishes.map(dish => (
              <li key={dish.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                <div>
                    <p className="font-medium text-gray-800">{dish.name}</p>
                    <p className="text-sm text-gray-500">{dish.restaurant}</p>
                </div>
                <p className="font-semibold text-gray-700">￥{dish.price.toFixed(2)}</p>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="mt-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Nutritional Overview</h4>
            <div className="grid grid-cols-3 gap-4">
                <MacroPill label="Protein" value={macros.protein} unit="g" color="bg-sky-100 text-sky-800" />
                <MacroPill label="Carbs" value={macros.carbs} unit="g" color="bg-amber-100 text-amber-800" />
                <MacroPill label="Fat" value={macros.fat} unit="g" color="bg-rose-100 text-rose-800" />
            </div>
             {warnings.length > 0 && (
              <div className="mt-4 text-sm text-yellow-800 bg-yellow-100 p-3 rounded-lg">
                <span className="font-semibold">Heads up:</span> {warnings.join(', ')}.
              </div>
            )}
        </div>
      </div>
      
      <div className="bg-gray-50 p-6 md:p-8 border-t border-gray-200">
        <h4 className="text-base font-semibold text-gray-800 mb-2">Why this meal?</h4>
        <p className="text-gray-600 text-sm leading-relaxed">{reasoning}</p>
      </div>
    </div>
  );
};

export default RecommendationCard;
