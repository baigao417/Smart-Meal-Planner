
import React, { useState, useEffect } from 'react';
import { UserProfile, DietGoal } from '../types';

interface UserProfileSetupProps {
  onSave: (profile: UserProfile) => void;
  currentUser: UserProfile | null;
}

const UserProfileSetup: React.FC<UserProfileSetupProps> = ({ onSave, currentUser }) => {
  const [profile, setProfile] = useState<UserProfile>(
    currentUser || {
      id: currentUser?.id || `user-${Date.now()}`,
      name: '',
      weightKg: 70,
      dietGoal: DietGoal.MAINTENANCE,
      preferences: '',
      budget: 30,
    }
  );
  
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfile(currentUser);
    }
  }, [currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: name === 'weightKg' || name === 'budget' ? parseFloat(value) : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(profile);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-lg">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">{currentUser ? 'Edit Your Profile' : 'Welcome! Let\'s Get Started.'}</h2>
      <p className="text-gray-600 mb-8">{currentUser ? 'Update your details to refine recommendations.' : 'Tell us a bit about yourself to get personalized meal plans.'}</p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            name="name"
            id="name"
            value={profile.name}
            onChange={handleChange}
            placeholder="e.g., Alex"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="weightKg" className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                <input
                    type="number"
                    name="weightKg"
                    id="weightKg"
                    value={profile.weightKg}
                    onChange={handleChange}
                    min="30"
                    max="200"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
            </div>
            <div>
                <label htmlFor="budget" className="block text-sm font-medium text-gray-700 mb-1">Daily Budget (￥)</label>
                <input
                    type="number"
                    name="budget"
                    id="budget"
                    value={profile.budget}
                    onChange={handleChange}
                    min="5"
                    max="200"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
            </div>
        </div>
        
        <div>
          <label htmlFor="dietGoal" className="block text-sm font-medium text-gray-700 mb-1">Primary Goal</label>
          <select
            name="dietGoal"
            id="dietGoal"
            value={profile.dietGoal}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition bg-white"
          >
            {Object.values(DietGoal).map(goal => (
              <option key={goal} value={goal}>{goal}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="preferences" className="block text-sm font-medium text-gray-700 mb-1">Food Preferences & Restrictions</label>
          <textarea
            name="preferences"
            id="preferences"
            value={profile.preferences}
            onChange={handleChange}
            rows={3}
            placeholder="e.g., love spicy food, allergic to shellfish, avoid cilantro"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex justify-end">
            <button
                type="submit"
                className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-300 ease-in-out"
            >
                {isSaved ? 'Saved!' : 'Save Profile'}
            </button>
        </div>
      </form>
    </div>
  );
};

export default UserProfileSetup;
