
import React, { useState, useEffect } from 'react';
import { UserProfile, DietGoal } from '../types';

interface UserProfileSetupProps {
  onSave: (profile: UserProfile) => void;
  currentUser: UserProfile | null;
  cloudSyncAvailable?: boolean;
  cloudSyncProvider?: 'vercel-kv' | 'webdav';
  cloudSyncHint?: string | null;
  syncError?: string | null;
}

const UserProfileSetup: React.FC<UserProfileSetupProps> = ({
  onSave,
  currentUser,
  cloudSyncAvailable = true,
  cloudSyncProvider,
  cloudSyncHint,
  syncError,
}) => {
  const [profile, setProfile] = useState<UserProfile>(
    currentUser || {
      id: currentUser?.id || `user-${Date.now()}`,
      name: '',
      weightKg: 70,
      dietGoal: DietGoal.MAINTENANCE,
      preferences: '',
      budget: 30,
      mealsPerDay: 3,
      budgetMode: 'balanced',
      averageDecisionMinutes: 12,
      email: '',
      syncEnabled: false,
    }
  );

  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfile({
        ...currentUser,
        email: currentUser.email ?? '',
        syncEnabled: currentUser.syncEnabled ?? false,
        mealsPerDay: currentUser.mealsPerDay ?? 3,
        budgetMode: currentUser.budgetMode ?? 'balanced',
        averageDecisionMinutes: currentUser.averageDecisionMinutes ?? 12,
      });
    }
  }, [currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'weightKg' || name === 'budget' || name === 'averageDecisionMinutes') {
      setProfile(prev => ({ ...prev, [name]: parseFloat(value) }));
      return;
    }
    if (name === 'mealsPerDay') {
      const numericValue = Number.parseInt(value, 10);
      if (Number.isNaN(numericValue)) {
        setProfile((prev) => ({ ...prev, mealsPerDay: 1 }));
        return;
      }
      const clamped = Math.max(1, Math.min(6, numericValue));
      setProfile((prev) => ({ ...prev, mealsPerDay: clamped }));
      return;
    }
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setProfile(prev => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = profile.email?.trim().toLowerCase();
    if (profile.syncEnabled && !trimmedEmail) {
      alert('Please enter an email address to enable cloud sync.');
      return;
    }

    const nextProfile: UserProfile = {
      ...profile,
      email: trimmedEmail,
      id: profile.syncEnabled && trimmedEmail ? trimmedEmail : profile.id || `user-${Date.now()}`,
    };

    if (!nextProfile.id) {
      nextProfile.id = `user-${Date.now()}`;
    }

    onSave(nextProfile);
    setProfile(nextProfile);
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
            <div>
                <label htmlFor="mealsPerDay" className="block text-sm font-medium text-gray-700 mb-1">Meals Per Day</label>
                <input
                    type="number"
                    name="mealsPerDay"
                    id="mealsPerDay"
                    value={profile.mealsPerDay ?? 3}
                    onChange={handleChange}
                    min={1}
                    max={6}
                    step={1}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
                <p className="text-xs text-gray-500 mt-1">请输入 1-6 餐，系统会按餐次自动分配预算。</p>
            </div>
            <div>
                <label htmlFor="budgetMode" className="block text-sm font-medium text-gray-700 mb-1">Budget Mode</label>
                <select
                    name="budgetMode"
                    id="budgetMode"
                    value={profile.budgetMode ?? 'balanced'}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition bg-white"
                >
                    <option value="balanced">平衡模式</option>
                    <option value="saver">节约模式</option>
                    <option value="enjoy">享受模式</option>
                </select>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="averageDecisionMinutes" className="block text-sm font-medium text-gray-700 mb-1">Time Saved per Plan (minutes)</label>
            <input
              type="number"
              name="averageDecisionMinutes"
              id="averageDecisionMinutes"
              value={profile.averageDecisionMinutes ?? 12}
              min="5"
              max="60"
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <p className="text-xs text-gray-500 mt-1">用于 FIRE 计时器，衡量你每次决策节省的平均时间。</p>
          </div>
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

        <div className="border-t border-gray-200 pt-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Cloud Sync</h3>
          <p className="text-sm text-gray-600 mb-4">
            Use the same email and enable sync to keep your meals and preferences consistent across devices.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                id="email"
                value={profile.email ?? ''}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
            </div>
            <label className="flex items-start space-x-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <input
                type="checkbox"
                name="syncEnabled"
                checked={!!profile.syncEnabled}
                onChange={handleCheckboxChange}
                disabled={!cloudSyncAvailable}
                className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                <span className="font-semibold block">Enable secure cloud sync</span>
                {cloudSyncAvailable
                  ? cloudSyncProvider === 'webdav'
                    ? 'Changes will back up to the configured WebDAV storage (e.g., OneDrive, Nextcloud).' 
                    : 'Changes will back up automatically when this is enabled.'
                  : 'Cloud sync is not available on this deployment yet.'}
              </span>
            </label>
          </div>
          {profile.syncEnabled && !cloudSyncAvailable && (
            <p className="text-sm text-red-600 mt-3">
              Cloud sync is currently unavailable. Disable sync or contact the administrator.
            </p>
          )}
          {cloudSyncHint && (
            <p className="text-xs text-amber-600 mt-2 whitespace-pre-line">{cloudSyncHint}</p>
          )}
          {profile.syncEnabled && syncError && (
            <p className="text-sm text-amber-600 mt-3">{syncError}</p>
          )}
          <div className="mt-4 space-y-2 text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4">
            <p className="font-semibold text-gray-700">Deploy tips</p>
            {cloudSyncAvailable && cloudSyncProvider === 'vercel-kv' && (
              <p>Sync is using Vercel KV. Ensure the KV integration remains connected so backups stay up to date.</p>
            )}
            {cloudSyncAvailable && cloudSyncProvider === 'webdav' && (
              <p>
                Sync is using a WebDAV endpoint. You can point it at services like OneDrive (using the WebDAV URL
                <code className="px-1 py-0.5 bg-gray-200 rounded ml-1 mr-1">https://d.docs.live.net/&lt;cid&gt;/Documents</code>) or Nextcloud.
              </p>
            )}
            {!cloudSyncAvailable && (
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Enable <span className="font-medium">Vercel KV</span> and set <code className="px-1 py-0.5 bg-gray-200 rounded">KV_REST_API_URL</code> and
                  <code className="px-1 py-0.5 bg-gray-200 rounded ml-1">KV_REST_API_TOKEN</code> in your deployment.
                </li>
                <li>
                  Or add WebDAV credentials via <code className="px-1 py-0.5 bg-gray-200 rounded">WEBDAV_BASE_URL</code>,
                  <code className="px-1 py-0.5 bg-gray-200 rounded ml-1">WEBDAV_USERNAME</code>, and
                  <code className="px-1 py-0.5 bg-gray-200 rounded ml-1">WEBDAV_PASSWORD</code> to sync with services such as OneDrive or NAS.
                </li>
              </ul>
            )}
          </div>
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
