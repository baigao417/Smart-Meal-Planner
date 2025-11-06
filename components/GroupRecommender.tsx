import React, { useCallback, useMemo, useState } from 'react';
import {
  Dish,
  GroupMealRecord,
  GroupParticipant,
  MealRecommendation,
  SharedDishInfo,
  UserProfile,
} from '../types';
import { siliconflowService } from '../services/siliconflowService';
import RecommendationCard from './RecommendationCard';
import { ArrowPathIcon, PlusIcon, SparklesIcon, UserGroupIcon } from './Icons';

interface GroupRecommenderProps {
  allUsers: UserProfile[];
  dishes: Dish[];
  currentUser: UserProfile;
  onSaveGroupMeal: (record: GroupMealRecord) => void;
  groupMeals: GroupMealRecord[];
  incrementTimeSaved: (minutes: number) => void;
}

interface AssistantResult {
  restaurant: string;
  headline: string;
  perPersonBudget: number;
  dishes: string[];
  steps: string[];
  summary: string;
}

const DEFAULT_DECISION_MINUTES = 15;

function createParticipantFromUser(user: UserProfile): GroupParticipant {
  return {
    id: `participant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: user.id,
    name: user.name,
    weight: 1,
    customPreferences: user.preferences ?? '',
    shareRatio: 1,
  };
}

function normalizeRatios(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return values.map(() => Number((1 / values.length).toFixed(2)));
  }
  return values.map((value) => Number((value / total).toFixed(2)));
}

function parseSharedDishes(input: string): SharedDishInfo[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,|]/).map((part) => part.trim());
      const [name, calories, ratio] = parts;
      const numericCalories = calories ? Number(calories.replace(/[^0-9.]/g, '')) : undefined;
      const shareRatio = ratio ? Number(ratio.replace(/[^0-9.]/g, '')) : undefined;
      return {
        name,
        calories: Number.isFinite(numericCalories) ? numericCalories : undefined,
        shareRatio: Number.isFinite(shareRatio) ? shareRatio : undefined,
      };
    })
    .filter((dish) => dish.name.length > 0);
}

async function findBestGroupMeal(
  participants: GroupParticipant[],
  allUsers: UserProfile[],
  dishes: Dish[],
  currentUser: UserProfile
): Promise<MealRecommendation | null> {
  if (!participants.length || !dishes.length) {
    return null;
  }

  const candidates = [...dishes].sort(() => 0.5 - Math.random()).slice(0, 3);
  const meal: MealRecommendation = {
    dishes: candidates,
    macros: candidates.reduce(
      (acc, dish) => ({
        protein: acc.protein + dish.protein,
        carbs: acc.carbs + dish.carbs,
        fat: acc.fat + dish.fat,
      }),
      { protein: 0, carbs: 0, fat: 0 }
    ),
    totalPrice: candidates.reduce((sum, dish) => sum + dish.price, 0),
    satisfactionScore: 85,
    reasoning: '',
    warnings: [],
  };

  try {
    const participantPayload = participants.map((participant) => {
      const linkedUser = participant.userId
        ? allUsers.find((candidate) => candidate.id === participant.userId)
        : null;
      const base = linkedUser || {
        id: participant.id,
        name: participant.name,
        weightKg: currentUser.weightKg ?? 60,
        dietGoal: linkedUser?.dietGoal ?? currentUser.dietGoal,
        preferences: participant.customPreferences ?? '',
        budget: linkedUser?.budget ?? currentUser.budget ?? 60,
      };
      return {
        user: {
          ...base,
          name: participant.name,
          preferences: participant.customPreferences ?? base.preferences,
        },
        weight: participant.weight,
      };
    });

    const reasoning = await siliconflowService.generateGroupRecommendationText(meal, participantPayload);
    return { ...meal, reasoning };
  } catch (error) {
    console.error('Group recommendation failed:', error);
    return meal;
  }
}

const GroupRecommender: React.FC<GroupRecommenderProps> = ({
  allUsers,
  dishes,
  currentUser,
  onSaveGroupMeal,
  groupMeals,
  incrementTimeSaved,
}) => {
  const [participants, setParticipants] = useState<GroupParticipant[]>([
    createParticipantFromUser(currentUser),
  ]);
  const [groupMeal, setGroupMeal] = useState<MealRecommendation | null>(null);
  const [isLoadingMeal, setIsLoadingMeal] = useState(false);
  const [assistantForm, setAssistantForm] = useState({
    size: 4,
    taste: currentUser.preferences ?? '',
    budget: currentUser.budget ?? 60,
  });
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantResult, setAssistantResult] = useState<AssistantResult | null>(null);
  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    restaurant: '',
    totalPrice: '',
    sharedDishes: '',
    notes: '',
  });
  const [logError, setLogError] = useState<string | null>(null);
  const [isSavingLog, setIsSavingLog] = useState(false);

  const selectedUserIds = useMemo(() => new Set(participants.map((p) => p.userId).filter(Boolean) as string[]), [participants]);

  const availableUsers = useMemo(
    () => allUsers.filter((user) => !selectedUserIds.has(user.id)),
    [allUsers, selectedUserIds]
  );

  const handleParticipantUserChange = (id: string, userId: string) => {
    setParticipants((prev) =>
      prev.map((participant) => {
        if (participant.id !== id) return participant;
        if (!userId) {
          return {
            ...participant,
            userId: undefined,
            name: participant.name || '新成员',
            customPreferences: participant.customPreferences ?? '',
          };
        }
        const user = allUsers.find((candidate) => candidate.id === userId);
        if (!user) return participant;
        return {
          ...participant,
          userId: user.id,
          name: user.name,
          customPreferences: user.preferences ?? '',
        };
      })
    );
  };

  const handleParticipantField = (id: string, field: keyof GroupParticipant, value: string | number) => {
    setParticipants((prev) =>
      prev.map((participant) =>
        participant.id === id
          ? {
              ...participant,
              [field]: (() => {
                if (field === 'weight') {
                  const numeric = typeof value === 'number' ? value : parseFloat(value);
                  return Number.isFinite(numeric) ? Math.max(0.1, numeric) : participant.weight;
                }
                if (field === 'shareRatio') {
                  const numeric = typeof value === 'number' ? value : parseFloat(value);
                  return Number.isFinite(numeric) ? Math.max(0, numeric) : participant.shareRatio ?? 1;
                }
                if (field === 'personalScore') {
                  const numeric = typeof value === 'number' ? value : parseFloat(value);
                  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : participant.personalScore;
                }
                return value;
              })(),
            }
          : participant
      )
    );
  };

  const addParticipant = (source?: UserProfile) => {
    setParticipants((prev) => [
      ...prev,
      source
        ? createParticipantFromUser(source)
        : {
            id: `participant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: '新成员',
            weight: 1,
            customPreferences: '',
            shareRatio: 1,
          },
    ]);
  };

  const removeParticipant = (id: string) => {
    setParticipants((prev) => (prev.length > 1 ? prev.filter((participant) => participant.id !== id) : prev));
  };

  const fetchGroupRecommendation = useCallback(async () => {
    setIsLoadingMeal(true);
    setGroupMeal(null);
    try {
      const meal = await findBestGroupMeal(participants, allUsers, dishes, currentUser);
      setGroupMeal(meal);
      if (meal) {
        incrementTimeSaved(currentUser.averageDecisionMinutes ?? DEFAULT_DECISION_MINUTES);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingMeal(false);
    }
  }, [participants, allUsers, currentUser, dishes, incrementTimeSaved]);

  const handleAssistant = async () => {
    setAssistantLoading(true);
    setAssistantResult(null);
    try {
      const result = await siliconflowService.recommendGroupDining({
        partySize: assistantForm.size,
        taste: assistantForm.taste,
        budget: assistantForm.budget,
      });
      setAssistantResult(result);
      incrementTimeSaved((currentUser.averageDecisionMinutes ?? DEFAULT_DECISION_MINUTES) * 0.5);
    } catch (error) {
      console.error(error);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleLogSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLogError(null);
    const price = Number(parseFloat(logForm.totalPrice).toFixed(2));
    if (!logForm.restaurant || !Number.isFinite(price)) {
      setLogError('请填写餐厅名称与总价。');
      return;
    }
    const normalizedRatios = normalizeRatios(participants.map((participant) => Number(participant.shareRatio ?? 1)));
    const mealId = `group-${Date.now()}`;
    const record: GroupMealRecord = {
      id: mealId,
      date: logForm.date,
      restaurant: logForm.restaurant,
      totalPrice: price,
      sharedDishes: parseSharedDishes(logForm.sharedDishes),
      totalScore: undefined,
      createdBy: currentUser.id,
      notes: logForm.notes,
      participants: participants.map((participant, index) => ({
        id: `${participant.id}-entry`,
        groupMealId: mealId,
        userId: participant.userId,
        name: participant.name,
        shareRatio: normalizedRatios[index] ?? 1,
        personalScore: Number.isFinite(participant.personalScore ?? NaN)
          ? Number(participant.personalScore)
          : undefined,
        notes: participant.notes,
      })),
    };

    setIsSavingLog(true);
    try {
      onSaveGroupMeal(record);
      incrementTimeSaved(currentUser.averageDecisionMinutes ?? DEFAULT_DECISION_MINUTES);
      setLogForm({
        date: new Date().toISOString().slice(0, 10),
        restaurant: '',
        totalPrice: '',
        sharedDishes: '',
        notes: '',
      });
    } finally {
      setIsSavingLog(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <section className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Group Meal Mode</h2>
            <p className="text-gray-600 mt-1">为每位成员定制偏好，AI 生成兼顾口味与预算的聚餐方案。</p>
          </div>
          <button
            type="button"
            onClick={fetchGroupRecommendation}
            disabled={isLoadingMeal}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {isLoadingMeal ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <UserGroupIcon className="w-5 h-5" />}
            {isLoadingMeal ? '生成中…' : '生成小组餐单'}
          </button>
        </div>

        <div className="space-y-4">
          {participants.map((participant, index) => (
            <div key={participant.id} className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">成员名称</label>
                    <input
                      type="text"
                      value={participant.name}
                      onChange={(event) => handleParticipantField(participant.id, 'name', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">关联好友</label>
                    <select
                      value={participant.userId ?? ''}
                      onChange={(event) => handleParticipantUserChange(participant.id, event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">自定义成员</option>
                      {allUsers.map((user) => (
                        <option key={user.id} value={user.id} disabled={participant.userId !== user.id && selectedUserIds.has(user.id)}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">权重 (影响推荐)</label>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={participant.weight}
                      onChange={(event) => handleParticipantField(participant.id, 'weight', parseFloat(event.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">分摊比例</label>
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={participant.shareRatio ?? 1}
                      onChange={(event) => handleParticipantField(participant.id, 'shareRatio', parseFloat(event.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeParticipant(participant.id)}
                  className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                  disabled={participants.length === 1}
                >
                  移除
                </button>
              </div>
              <textarea
                rows={2}
                placeholder="个人偏好 / 禁忌 / 想尝试的菜"
                value={participant.customPreferences ?? ''}
                onChange={(event) => handleParticipantField(participant.id, 'customPreferences', event.target.value)}
                className="w-full rounded-lg border border-dashed border-indigo-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">个人评分 (餐后填写)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={participant.personalScore ?? ''}
                    onChange={(event) => handleParticipantField(participant.id, 'personalScore', parseFloat(event.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">聚餐感受</label>
                  <input
                    type="text"
                    value={participant.notes ?? ''}
                    onChange={(event) => handleParticipantField(participant.id, 'notes', event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="例如：喜欢小龙虾锅底"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => addParticipant()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <PlusIcon className="w-4 h-4" /> 添加自定义成员
          </button>
          {availableUsers.length > 0 && (
            <button
              type="button"
              onClick={() => addParticipant(availableUsers[0])}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-indigo-500 text-indigo-600 hover:bg-indigo-50"
            >
              <PlusIcon className="w-4 h-4" /> 从好友列表添加
            </button>
          )}
        </div>

        {groupMeal && (
          <div className="pt-6">
            <RecommendationCard recommendation={groupMeal} />
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold text-gray-900">聚餐 AI 助手</h3>
          <p className="text-gray-600">三步输入人数、口味、预算，获取聚餐地点快速建议。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">人数</label>
            <input
              type="number"
              min={2}
              value={assistantForm.size}
              onChange={(event) => setAssistantForm((prev) => ({ ...prev, size: Number(event.target.value) }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">口味 / 场景</label>
            <input
              type="text"
              value={assistantForm.taste}
              onChange={(event) => setAssistantForm((prev) => ({ ...prev, taste: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="如：偏辣、想要火锅或烧烤、需要包间"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">预算 (¥/人)</label>
            <input
              type="number"
              min={20}
              value={assistantForm.budget}
              onChange={(event) => setAssistantForm((prev) => ({ ...prev, budget: Number(event.target.value) }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleAssistant}
          disabled={assistantLoading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-700 disabled:bg-emerald-300"
        >
          {assistantLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
          {assistantLoading ? '召唤中…' : '生成聚餐建议'}
        </button>
        {assistantResult && (
          <div className="border border-emerald-200 rounded-2xl p-6 bg-emerald-50 space-y-4">
            <div>
              <p className="text-sm text-emerald-600 uppercase tracking-wide">推荐餐厅</p>
              <h4 className="text-2xl font-semibold text-emerald-800">{assistantResult.restaurant}</h4>
              <p className="text-emerald-700 mt-2">{assistantResult.headline}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/70 border border-emerald-200 p-4">
                <p className="text-sm text-emerald-600">人均预算</p>
                <p className="text-xl font-semibold text-emerald-800">¥{assistantResult.perPersonBudget.toFixed(0)}</p>
              </div>
              <div className="rounded-xl bg-white/70 border border-emerald-200 p-4">
                <p className="text-sm text-emerald-600">推荐菜品</p>
                <p className="text-emerald-800 text-sm leading-relaxed">
                  {assistantResult.dishes.join('、')}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-emerald-700">最多三步搞定：</p>
              <ol className="list-decimal list-inside text-sm text-emerald-700 space-y-1">
                {assistantResult.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
            <p className="text-sm text-emerald-800">{assistantResult.summary}</p>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold text-gray-900">聚餐记录</h3>
          <p className="text-gray-600">聚餐结束后快速记录，总价自动均分，方便回顾与同步。</p>
        </div>
        <form className="space-y-4" onSubmit={handleLogSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">聚餐日期</label>
              <input
                type="date"
                value={logForm.date}
                onChange={(event) => setLogForm((prev) => ({ ...prev, date: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">餐厅名称</label>
              <input
                type="text"
                value={logForm.restaurant}
                onChange={(event) => setLogForm((prev) => ({ ...prev, restaurant: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">总价 (¥)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={logForm.totalPrice}
                onChange={(event) => setLogForm((prev) => ({ ...prev, totalPrice: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">菜品记录</label>
            <textarea
              rows={3}
              value={logForm.sharedDishes}
              onChange={(event) => setLogForm((prev) => ({ ...prev, sharedDishes: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="每行一个菜，可写成：麻辣牛蛙, 560, 0.2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">备注</label>
            <textarea
              rows={2}
              value={logForm.notes}
              onChange={(event) => setLogForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="如：服务很好 / 下次想尝试新品"
            />
          </div>
          {logError && <p className="text-sm text-rose-600">{logError}</p>}
          <button
            type="submit"
            disabled={isSavingLog}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {isSavingLog ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
            {isSavingLog ? '保存中…' : '保存聚餐记录'}
          </button>
        </form>
        {groupMeals.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-lg font-semibold text-gray-800">历史聚餐</h4>
            <div className="space-y-3">
              {groupMeals.map((meal) => (
                <div key={meal.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm text-gray-500">{new Date(meal.date).toLocaleDateString()}</p>
                      <p className="text-lg font-semibold text-gray-900">{meal.restaurant} · ¥{meal.totalPrice.toFixed(2)}</p>
                    </div>
                    <p className="text-sm text-gray-500">
                      分摊：
                      {meal.participants
                        .map((participant) => `${participant.name} ${Math.round((participant.shareRatio ?? 0) * 100)}%`)
                        .join(' | ')}
                    </p>
                  </div>
                  {meal.notes && <p className="text-sm text-gray-600 mt-2">备注：{meal.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default GroupRecommender;
