import React, { useEffect, useMemo, useState } from 'react';
import {
  BudgetMode,
  DailyPlanRecord,
  Dish,
  MealRecommendation,
  UserProfile,
} from '../types';
import { generateDailyPlan } from '../lib/recommendation';
import { ArrowPathIcon, SparklesIcon } from './Icons';

const MODE_LABELS: Record<BudgetMode, string> = {
  balanced: '平衡模式',
  saver: '节约模式 (-15%)',
  enjoy: '享受模式 (+10%)',
};

const MODE_DESCRIPTIONS: Record<BudgetMode, string> = {
  balanced: '预算按默认比例分配，兼顾口味与营养。',
  saver: '优先推荐高分低价菜品，帮助你守住预算。',
  enjoy: '允许预算轻微超出，更偏向高口碑菜品。',
};

const DEFAULT_DECISION_MINUTES = 12;

function formatCurrency(value: number): string {
  return `¥${value.toFixed(2)}`;
}

function deriveMacroRatio(macros: MealRecommendation['macros']) {
  const total = macros.protein + macros.carbs + macros.fat;
  if (!total) {
    return { protein: 0, carbs: 0, fat: 0 };
  }
  return {
    protein: Math.round((macros.protein / total) * 100),
    carbs: Math.round((macros.carbs / total) * 100),
    fat: Math.round((macros.fat / total) * 100),
  };
}

function getMacroSummary(macros: MealRecommendation['macros']) {
  const ratio = deriveMacroRatio(macros);
  return `碳水 ${ratio.carbs}% / 蛋白质 ${ratio.protein}% / 脂肪 ${ratio.fat}%`;
}

function getBudgetStatus(plan: DailyPlanRecord | null) {
  if (!plan) return { tone: 'neutral', text: '尚未生成今日预算' };
  const diff = plan.totalSpent - plan.budget;
  if (diff > plan.budget * 0.1) {
    return { tone: 'over', text: `今日已超支 ${formatCurrency(diff)}，记得关注花费。` };
  }
  if (diff < -plan.budget * 0.1) {
    return { tone: 'under', text: `今日节省 ${formatCurrency(Math.abs(diff))}，FIRE 进度 +1！` };
  }
  return { tone: 'balanced', text: '今日支出贴合预算，继续保持。' };
}

function getSmartBudgetTip(history: DailyPlanRecord[], currentPlan: DailyPlanRecord | null) {
  const combined = currentPlan
    ? [currentPlan, ...history.filter((record) => record.id !== currentPlan.id)]
    : history;
  if (combined.length < 3) return null;
  const recent = combined.slice(0, 3);
  const allUnderBudget = recent.every((record) => record.totalSpent < record.budget);
  if (!allUnderBudget) return null;
  const totalSaved = recent.reduce((sum, record) => sum + (record.budget - record.totalSpent), 0);
  return `你连续三天低于预算，共节省 ${formatCurrency(totalSaved)}，相当于替未来的自己存下了一份“特斯拉基金”。`;
}

function clampMealsPerDay(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 1;
  }
  return Math.max(1, Math.min(6, Math.round(value)));
}

interface DailyRecommenderProps {
  profile: UserProfile;
  dishes: Dish[];
  history: DailyPlanRecord[];
  onPlanGenerated: (record: DailyPlanRecord) => void;
  onSettingsPersist: (settings: { budget: number; mealsPerDay: number; mode: BudgetMode }) => void;
  incrementTimeSaved: (minutes: number) => void;
}

const DailyRecommender: React.FC<DailyRecommenderProps> = ({
  profile,
  dishes,
  history,
  onPlanGenerated,
  onSettingsPersist,
  incrementTimeSaved,
}) => {
  const [dailyBudget, setDailyBudget] = useState<number>(profile.budget);
  const [mode, setMode] = useState<BudgetMode>(profile.budgetMode ?? 'balanced');
  const [mealsPerDay, setMealsPerDay] = useState<number>(clampMealsPerDay(profile.mealsPerDay ?? 3));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<DailyPlanRecord | null>(null);

  useEffect(() => {
    setDailyBudget(profile.budget);
    setMode(profile.budgetMode ?? 'balanced');
    setMealsPerDay(clampMealsPerDay(profile.mealsPerDay ?? 3));
  }, [profile.budget, profile.budgetMode, profile.mealsPerDay]);

  useEffect(() => {
    if (history.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayRecord = history.find((record) => record.date.slice(0, 10) === today);
    setPlan(todayRecord ?? history[0] ?? null);
  }, [history]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const normalizedMeals = clampMealsPerDay(mealsPerDay);
      setMealsPerDay(normalizedMeals);
      onSettingsPersist({ budget: dailyBudget, mealsPerDay: normalizedMeals, mode });
      const planProfile: UserProfile = { ...profile, budget: dailyBudget };
      const nextPlan = await generateDailyPlan(planProfile, dishes, mode, normalizedMeals);
      setPlan(nextPlan);
      onPlanGenerated(nextPlan);
      const minutes = profile.averageDecisionMinutes ?? DEFAULT_DECISION_MINUTES;
      incrementTimeSaved(minutes);
    } catch (err) {
      console.error(err);
      setError('生成今日餐单时出现问题，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const macroSummary = useMemo(() => {
    if (!plan) return '等待生成今日推荐';
    return getMacroSummary(plan.macros);
  }, [plan]);

  const budgetStatus = useMemo(() => getBudgetStatus(plan), [plan]);
  const smartTip = useMemo(() => getSmartBudgetTip(history, plan), [history, plan]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Daily Budget & Meal Planner</h2>
            <p className="text-gray-600 mt-1">
              设定预算与餐次，AI 将分配每餐预算并生成高分菜单。
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || dishes.length === 0}
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5 mr-2" />}
            {isLoading ? '生成中…' : '生成今日推荐'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">每日预算 (¥)</label>
            <input
              type="number"
              min={10}
              step={1}
              value={dailyBudget}
              onChange={(event) => setDailyBudget(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-500">可随时调整，推荐区间 30-80 元。</p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">每日餐次数量</label>
            <input
              type="number"
              min={1}
              max={6}
              step={1}
              value={mealsPerDay}
              onChange={(event) => setMealsPerDay(clampMealsPerDay(Number(event.target.value)))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-500">可自定义 1-6 餐，系统会自动均衡分配预算。</p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">预算模式</label>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as BudgetMode)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:ring-indigo-500 focus:border-indigo-500"
            >
              {(Object.keys(MODE_LABELS) as BudgetMode[]).map((key) => (
                <option key={key} value={key}>
                  {MODE_LABELS[key]}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">{MODE_DESCRIPTIONS[mode]}</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex flex-col gap-3">
          <h3 className="text-2xl font-bold text-gray-900">📅 Today’s Recommendation</h3>
          <p className="text-gray-600">系统根据预算自动分配各餐次，并提供高分菜品组合。</p>
        </div>

        {plan ? (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">餐次</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">推荐菜品</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">餐厅</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">预算 / 实际</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">满意度</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {plan.slots.map((slot) => {
                    const recommendation = slot.recommendation;
                    const dishSummary = recommendation
                      ? recommendation.dishes.map((dish) => dish.name).join('、')
                      : '待补充菜品';
                    const restaurant = recommendation
                      ? Array.from(new Set(recommendation.dishes.map((dish) => dish.restaurant))).join(' / ')
                      : '—';
                    const satisfaction = recommendation
                      ? Math.round(recommendation.satisfactionScore)
                      : '—';
                    const totalPrice = recommendation ? formatCurrency(recommendation.totalPrice) : '—';
                    return (
                      <tr key={slot.slot} className="bg-white">
                        <td className="px-4 py-4 font-semibold text-gray-800">{slot.slot}</td>
                        <td className="px-4 py-4 text-gray-700">{dishSummary}</td>
                        <td className="px-4 py-4 text-gray-500">{restaurant}</td>
                        <td className="px-4 py-4 text-gray-700">
                          <div className="flex flex-col">
                            <span className="font-medium">{formatCurrency(slot.budget)}</span>
                            <span className="text-xs text-gray-500">实际 {totalPrice}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-indigo-600 font-semibold">{satisfaction}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500">今日预算</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(plan.totalSpent)} / {formatCurrency(plan.budget)}
                </p>
                <p
                  className={`text-sm mt-1 ${
                    budgetStatus.tone === 'under'
                      ? 'text-emerald-600'
                      : budgetStatus.tone === 'over'
                      ? 'text-rose-600'
                      : 'text-gray-600'
                  }`}
                >
                  {budgetStatus.text}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500">营养比例</p>
                <p className="text-lg font-semibold text-gray-900">{macroSummary}</p>
                <p className="text-sm text-gray-500 mt-1">
                  今日宏量营养素：P {plan.macros.protein}g / C {plan.macros.carbs}g / F {plan.macros.fat}g
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500">综合满意度</p>
                <p className="text-lg font-semibold text-gray-900">{Math.round(plan.totalSatisfaction)}</p>
                <p className="text-sm text-gray-500 mt-1">系统会根据历史评分持续优化结果。</p>
              </div>
            </div>

            {smartTip && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                {smartTip}
              </div>
            )}

            {plan.slots.some((slot) => slot.recommendation?.reasoning) && (
              <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                <h4 className="text-lg font-semibold text-gray-800">AI 说明</h4>
                {plan.slots.map((slot) => (
                  <div key={slot.slot} className="text-sm text-gray-600 space-y-1">
                    <p className="font-medium text-gray-800">{slot.slot}</p>
                    <p>{slot.recommendation?.reasoning}</p>
                    {slot.recommendation?.warnings.length ? (
                      <ul className="list-disc list-inside text-amber-600">
                        {slot.recommendation.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center bg-gray-50 border border-dashed border-indigo-300 rounded-2xl p-10">
            <SparklesIcon className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-800 mb-2">点击上方按钮，即刻生成全日餐单</p>
            <p className="text-gray-600 max-w-xl mx-auto">
              系统会自动分配预算、估算营养并保存历史记录，帮你每天节省 10+ 分钟的纠结时间。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyRecommender;
