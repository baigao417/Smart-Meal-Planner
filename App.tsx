import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, Dish, DietGoal } from './types';
import useLocalStorage from './hooks/useLocalStorage';
import UserProfileSetup from './components/UserProfileSetup';
import DailyRecommender from './components/DailyRecommender';
import DishManager from './components/DishManager';
import GroupRecommender from './components/GroupRecommender';
import { sampleDishes, sampleUsers } from './constants';
import { FireIcon, UserGroupIcon, Cog6ToothIcon, SparklesIcon, Bars3Icon, XMarkIcon, ArrowPathIcon } from './components/Icons';
import { syncService, SyncServiceError } from './services/syncService';

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
  const [cloudSyncAvailable, setCloudSyncAvailable] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const hasCompletedInitialSync = useRef(false);
  const initialSyncInFlight = useRef(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!newProfile.syncEnabled) {
      hasCompletedInitialSync.current = false;
      setSyncError(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    syncService.checkAvailability()
      .then((available) => {
        if (!cancelled) {
          setCloudSyncAvailable(available);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloudSyncAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profile?.syncEnabled || !profile.email) {
      hasCompletedInitialSync.current = false;
      initialSyncInFlight.current = false;
      setLastSyncedAt(null);
      return;
    }

    if (!cloudSyncAvailable || hasCompletedInitialSync.current) {
      return;
    }

    if (initialSyncInFlight.current) {
      return;
    }

    initialSyncInFlight.current = true;
    let cancelled = false;
    let shouldSeedRemote = false;
    setIsSyncing(true);
    setSyncError(null);

    syncService
      .pull(profile.email)
      .then((remoteData) => {
        if (cancelled || !remoteData) {
          shouldSeedRemote = !remoteData;
          return;
        }
        if (remoteData.profile !== undefined) {
          setProfile(remoteData.profile);
        }
        if (Array.isArray(remoteData.dishes)) {
          setDishes(remoteData.dishes);
        }
        if (Array.isArray(remoteData.allUsers)) {
          setAllUsers(remoteData.allUsers);
        }
        setLastSyncedAt(remoteData.updatedAt ?? new Date().toISOString());
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof SyncServiceError && error.code === 'CONFIGURATION') {
          setCloudSyncAvailable(false);
        }
        setSyncError(error instanceof Error ? error.message : 'Failed to restore cloud data.');
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        if (shouldSeedRemote) {
          syncService
            .push(profile.email as string, {
              profile,
              dishes,
              allUsers,
            })
            .then((remoteData) => {
              if (cancelled) return;
              setSyncError(null);
              setLastSyncedAt(remoteData.updatedAt);
            })
            .catch((error: unknown) => {
              if (cancelled) return;
              if (error instanceof SyncServiceError && error.code === 'CONFIGURATION') {
                setCloudSyncAvailable(false);
              }
              setSyncError(error instanceof Error ? error.message : 'Unable to save changes to the cloud.');
            })
            .finally(() => {
              if (!cancelled) {
                hasCompletedInitialSync.current = true;
                initialSyncInFlight.current = false;
                setIsSyncing(false);
              }
            });
        } else {
          hasCompletedInitialSync.current = true;
          initialSyncInFlight.current = false;
          setIsSyncing(false);
        }
      });

    return () => {
      cancelled = true;
      initialSyncInFlight.current = false;
    };
  }, [profile?.syncEnabled, profile?.email, cloudSyncAvailable, setProfile, setDishes, setAllUsers]);

  useEffect(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    if (!profile?.syncEnabled || !profile.email || !cloudSyncAvailable || !hasCompletedInitialSync.current) {
      return;
    }

    syncTimeoutRef.current = setTimeout(() => {
      setIsSyncing(true);
      syncService
        .push(profile.email as string, {
          profile,
          dishes,
          allUsers,
        })
        .then((remoteData) => {
          setSyncError(null);
          setLastSyncedAt(remoteData.updatedAt);
        })
        .catch((error: unknown) => {
          if (error instanceof SyncServiceError && error.code === 'CONFIGURATION') {
            setCloudSyncAvailable(false);
          }
          setSyncError(error instanceof Error ? error.message : 'Unable to save changes to the cloud.');
        })
        .finally(() => {
          setIsSyncing(false);
        });
    }, 800);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [profile, dishes, allUsers, cloudSyncAvailable]);

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
      return (
        <UserProfileSetup
          onSave={handleProfileSave}
          currentUser={null}
          cloudSyncAvailable={cloudSyncAvailable}
          syncError={syncError}
        />
      );
    }

    switch (view) {
      case 'recommender':
        return <DailyRecommender profile={profile} dishes={dishes} />;
      case 'dishes':
        return <DishManager dishes={dishes} setDishes={setDishes} />;
      case 'group':
        return <GroupRecommender allUsers={allUsers} dishes={dishes} currentUser={profile} />;
      case 'profile':
        return (
          <UserProfileSetup
            onSave={handleProfileSave}
            currentUser={profile}
            cloudSyncAvailable={cloudSyncAvailable}
            syncError={syncError}
          />
        );
      default:
        return <DailyRecommender profile={profile} dishes={dishes} />;
    }
  }, [view, profile, dishes, allUsers, cloudSyncAvailable, syncError]);

  const navContent = (
    <nav className="p-4 space-y-2">
        <NavItem currentView={view} viewName="recommender" icon={<SparklesIcon />} label="Today's Meal" />
        <NavItem currentView={view} viewName="dishes" icon={<Bars3Icon />} label="My Dishes" />
        <NavItem currentView={view} viewName="group" icon={<UserGroupIcon />} label="Group Mode" />
        <NavItem currentView={view} viewName="profile" icon={<Cog6ToothIcon />} label="My Profile" />
    </nav>
  );

  return (
    <div className="min-h-[100dvh] lg:flex">
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
            <header
              className="lg:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center sticky z-10 safe-area-top"
              style={{ top: 'var(--safe-area-top)' }}
            >
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
        
        <div className="p-4 sm:p-6 lg:p-8 space-y-4 pb-8">
            {profile?.syncEnabled && profile.email && (
              <div
                className={`rounded-xl border ${
                  !cloudSyncAvailable
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : syncError
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : isSyncing
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                } px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2`}
              >
                <span>
                  {!cloudSyncAvailable
                    ? 'Cloud sync is not configured yet. Data is stored only on this device.'
                    : syncError
                    ? syncError
                    : isSyncing
                    ? 'Syncing your meals…'
                    : lastSyncedAt
                    ? `All changes synced • Updated ${new Date(lastSyncedAt).toLocaleString()}`
                    : 'Cloud sync is ready.'}
                </span>
                {isSyncing && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              </div>
            )}
            {mainContent}
        </div>
      </main>
    </div>
  );
};

export default App;