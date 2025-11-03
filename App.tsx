import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Dish, DietGoal } from './types';
import useLocalStorage from './hooks/useLocalStorage';
import UserProfileSetup from './components/UserProfileSetup';
import DailyRecommender from './components/DailyRecommender';
import DishManager from './components/DishManager';
import GroupRecommender from './components/GroupRecommender';
import { sampleDishes, sampleUsers } from './constants';
import { FireIcon, UserGroupIcon, Cog6ToothIcon, SparklesIcon, Bars3Icon, XMarkIcon } from './components/Icons';

type View = 'recommender' | 'dishes' | 'group' | 'profile';

const App: React.FC = () => {
  // Seeding logic to ensure sample dishes are only loaded once.
  const [dishesSeeded, setDishesSeeded] = useLocalStorage('dishes-seeded', false);

  const [profile, setProfile] = useLocalStorage<UserProfile | null>('user-profile', null);
  const [dishes, setDishes] = useLocalStorage<Dish[]>(
    'user-dishes', 
    !dishesSeeded ? sampleDishes : [] // Only provide samples if not yet seeded
  );
  const [allUsers, setAllUsers] = useLocalStorage<UserProfile[]>('all-users', sampleUsers);

  // After the first render where we might have used sampleDishes, mark the seeded flag as true.
  // This ensures sample dishes are only added once, and an empty list is respected on subsequent loads.
  useEffect(() => {
    if (!dishesSeeded) {
      setDishesSeeded(true);
    }
  }, [dishesSeeded, setDishesSeeded]);


  const [view, setView] = useState<View>('recommender');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const handleProfileSave = (newProfile: UserProfile) => {
    setProfile(newProfile);
    const userExists = allUsers.some(u => u.id === newProfile.id);
    if (!userExists) {
        setAllUsers(prev => [...prev, newProfile]);
    } else {
        setAllUsers(prev => prev.map(u => u.id === newProfile.id ? newProfile : u));
    }
  };

  // Fix: Replaced JSX.Element with React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
  // Fix: Specified props for the icon to allow cloning with className.
  const NavItem = ({ currentView, viewName, icon, label }: { currentView: View, viewName: View, icon: React.ReactElement<React.SVGProps<SVGSVGElement>>, label: string }) => (
    <button
      onClick={() => {
        setView(viewName);
        setIsMenuOpen(false);
      }}
      className={`flex items-center space-x-3 p-3 rounded-lg w-full text-left transition-colors duration-200 ${
        currentView === viewName ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {React.cloneElement(icon, { className: "w-6 h-6" })}
      <span className="font-medium">{label}</span>
    </button>
  );

  const mainContent = useMemo(() => {
    if (!profile) {
      return <UserProfileSetup onSave={handleProfileSave} currentUser={null} />;
    }

    switch (view) {
      case 'recommender':
        return <DailyRecommender profile={profile} dishes={dishes} />;
      case 'dishes':
        return <DishManager dishes={dishes} setDishes={setDishes} />;
      case 'group':
        return <GroupRecommender allUsers={allUsers} dishes={dishes} currentUser={profile} />;
      case 'profile':
        return <UserProfileSetup onSave={handleProfileSave} currentUser={profile} />;
      default:
        return <DailyRecommender profile={profile} dishes={dishes} />;
    }
  }, [view, profile, dishes, allUsers]);

  const navContent = (
    <nav className="p-4 space-y-2">
        <NavItem currentView={view} viewName="recommender" icon={<SparklesIcon />} label="Today's Meal" />
        <NavItem currentView={view} viewName="dishes" icon={<Bars3Icon />} label="My Dishes" />
        <NavItem currentView={view} viewName="group" icon={<UserGroupIcon />} label="Group Mode" />
        <NavItem currentView={view} viewName="profile" icon={<Cog6ToothIcon />} label="My Profile" />
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar for desktop */}
      <aside className="hidden lg:block w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="h-full flex flex-col">
            <div className="p-6 flex items-center space-x-3 border-b">
                <FireIcon className="w-8 h-8 text-indigo-600" />
                <h1 className="text-xl font-bold text-gray-800">Meal Planner</h1>
            </div>
            {profile && navContent}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        {/* Header for mobile */}
        {profile && (
            <header className="lg:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center sticky top-0 z-10">
                 <div className="flex items-center space-x-3">
                    <FireIcon className="w-7 h-7 text-indigo-600" />
                    <h1 className="text-lg font-bold text-gray-800">Meal Planner</h1>
                </div>
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
                    {isMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
                </button>
            </header>
        )}

        {/* Mobile Menu */}
        {isMenuOpen && (
            <div className="lg:hidden bg-white border-b border-gray-200">
                {navContent}
            </div>
        )}
        
        <div className="p-4 sm:p-6 lg:p-8">
            {mainContent}
        </div>
      </main>
    </div>
  );
};

export default App;