import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UserProfile, Dish, DietGoal, CloudSyncStatus } from './types';
import useLocalStorage from './hooks/useLocalStorage';
import UserProfileSetup from './components/UserProfileSetup';
import DailyRecommender from './components/DailyRecommender';
import DishManager from './components/DishManager';
import GroupRecommender from './components/GroupRecommender';
import { sampleDishes, sampleUsers } from './constants';
import { FireIcon, UserGroupIcon, Cog6ToothIcon, SparklesIcon, Bars3Icon, XMarkIcon, ArrowPathIcon } from './components/Icons';
import { syncService, SyncServiceError } from './services/syncService';
import { siliconflowService } from './services/siliconflowService';

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
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>({ available: false });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{ available: boolean; message?: string; model?: string } | null>(null);
  const [isCheckingAi, setIsCheckingAi] = useState(false);
  const hasCompletedInitialSync = useRef(false);
  const initialSyncInFlight = useRef(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualBackupInputRef = useRef<HTMLInputElement>(null);

  // After the first render where we might have used sampleDishes, mark the seeded flag as true.
  // This ensures sample dishes are only added once, and an empty list is respected on subsequent loads.
  useEffect(() => {
    if (!dishesSeeded) {
      setDishesSeeded(true);
    }
  }, [dishesSeeded, setDishesSeeded]);


  const [view, setView] = useState<View>('recommender');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const refreshAiStatus = useCallback(() => {
    setIsCheckingAi(true);
    siliconflowService
      .checkAvailability()
      .then((status) => {
        setAiStatus(status);
      })
      .finally(() => {
        setIsCheckingAi(false);
      });
  }, []);

  useEffect(() => {
    refreshAiStatus();
  }, [refreshAiStatus]);
  
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
    syncService
      .checkAvailability()
      .then((status) => {
        if (!cancelled) {
          setCloudSyncStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloudSyncStatus({ available: false, hint: 'Cloud sync check failed unexpectedly.' });
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

    if (!cloudSyncStatus.available || hasCompletedInitialSync.current) {
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
          setCloudSyncStatus({ available: false, hint: error.message });
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
                setCloudSyncStatus({ available: false, hint: error.message });
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
  }, [profile?.syncEnabled, profile?.email, cloudSyncStatus.available, cloudSyncStatus.hint, setProfile, setDishes, setAllUsers]);

  useEffect(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    if (!profile?.syncEnabled || !profile.email || !cloudSyncStatus.available || !hasCompletedInitialSync.current) {
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
            setCloudSyncStatus({ available: false, hint: error.message });
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
  }, [profile, dishes, allUsers, cloudSyncStatus.available]);

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

  const handleManualExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      dishes,
      allUsers,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `meal-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleManualImportClick = () => {
    manualBackupInputRef.current?.click();
  };

  const handleManualImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        profile?: UserProfile | null;
        dishes?: Dish[];
        allUsers?: UserProfile[];
      };

      if (parsed.profile) {
        setProfile(parsed.profile);
      }
      if (Array.isArray(parsed.dishes)) {
        setDishes(parsed.dishes);
      }
      if (Array.isArray(parsed.allUsers)) {
        setAllUsers(parsed.allUsers);
      }
      alert('Backup restored. Review your meals and profile before continuing.');
    } catch (error) {
      console.error('Failed to import backup:', error);
      alert('Unable to import backup. Please verify the file and try again.');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const mainContent = useMemo(() => {
    if (!profile) {
      return (
        <UserProfileSetup
          onSave={handleProfileSave}
          currentUser={null}
          cloudSyncAvailable={cloudSyncStatus.available}
          cloudSyncProvider={cloudSyncStatus.provider}
          cloudSyncHint={cloudSyncStatus.hint}
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
            cloudSyncAvailable={cloudSyncStatus.available}
            cloudSyncProvider={cloudSyncStatus.provider}
            cloudSyncHint={cloudSyncStatus.hint}
            syncError={syncError}
          />
        );
      default:
        return <DailyRecommender profile={profile} dishes={dishes} />;
    }
  }, [view, profile, dishes, allUsers, cloudSyncStatus.available, cloudSyncStatus.hint, cloudSyncStatus.provider, syncError]);

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
            <input
              type="file"
              accept=".json"
              ref={manualBackupInputRef}
              onChange={handleManualImport}
              style={{ display: 'none' }}
            />
            {aiStatus && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2 ${
                  aiStatus.available
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-400 bg-amber-50 text-amber-800'
                }`}
              >
                <span>
                  {aiStatus.available
                    ? `AI 服务已连接${aiStatus.model ? ` • 模型 ${aiStatus.model}` : ''}`
                    : aiStatus.message || 'AI 服务不可用，请检查 Vercel 环境变量或代理配置。'}
                </span>
                <button
                  type="button"
                  onClick={refreshAiStatus}
                  disabled={isCheckingAi}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-current"
                >
                  {isCheckingAi ? '检测中…' : '重新检测'}
                </button>
              </div>
            )}
            {profile?.syncEnabled && profile.email && (
              <div
                className={`rounded-xl border ${
                  !cloudSyncStatus.available
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : syncError
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : isSyncing
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                } px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2`}
              >
                <span>
                  {!cloudSyncStatus.available
                    ? cloudSyncStatus.hint || 'Cloud sync is not configured yet. Data is stored only on this device.'
                    : syncError
                    ? syncError
                    : isSyncing
                    ? 'Syncing your meals…'
                    : lastSyncedAt
                    ? `All changes synced • Updated ${new Date(lastSyncedAt).toLocaleString()}`
                    : cloudSyncStatus.provider === 'webdav'
                    ? 'Cloud sync is active via WebDAV storage.'
                    : 'Cloud sync is ready.'}
                </span>
                {isSyncing && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              </div>
            )}
            {(profile || dishes.length > 0) && (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Manual backup & transfer</h3>
                    <p className="text-xs text-gray-500">
                      Export a JSON snapshot or restore one saved to services like OneDrive, iCloud, or local storage.
                    </p>
                    {!cloudSyncStatus.available && cloudSyncStatus.hint && (
                      <p className="text-xs text-amber-600 mt-1">{cloudSyncStatus.hint}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleManualExport}
                      className="px-3 py-2 text-sm font-semibold rounded-lg border border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleManualImportClick}
                      className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Import JSON
                    </button>
                  </div>
                </div>
              </div>
            )}
            {mainContent}
        </div>
      </main>
    </div>
  );
};

export default App;