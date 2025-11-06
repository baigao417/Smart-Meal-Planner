import React, { useMemo, useState } from 'react';
import { DailyPlanRecord } from '../types';
import { ArrowPathIcon, SparklesIcon } from './Icons';

interface DailyPlanHistoryProps {
  history: DailyPlanRecord[];
  onReusePlan?: (plan: DailyPlanRecord) => void;
}

const MODE_LABELS: Record<DailyPlanRecord['mode'], string> = {
  balanced: '平衡模式',
  saver: '节约模式',
  enjoy: '享受模式',
};

function formatCurrency(value: number): string {
  return `¥${value.toFixed(2)}`;
}

const DailyPlanHistory: React.FC<DailyPlanHistoryProps> = ({ history, onReusePlan }) => {
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState<'all' | DailyPlanRecord['mode']>('all');

  const filtered = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return history.filter((record) => {
      if (mode !== 'all' && record.mode !== mode) return false;
      if (!normalizedKeyword) return true;
      const haystack = [
        record.date,
        record.mode,
        record.slots.map((slot) => slot.slot).join(' '),
        record.slots
          .flatMap((slot) => (slot.recommendation ? slot.recommendation.dishes.map((dish) => dish.name) : []))
          .join(' '),
        record.slots
          .flatMap((slot) => (slot.recommendation ? slot.recommendation.dishes.map((dish) => dish.restaurant) : []))
          .join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [history, keyword, mode]);

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      plans: history,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `meal-plans-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">今日推荐历史</h2>
            <p className="text-gray-600 mt-1">查看过往 AI 菜单、预算执行情况，可随时复用或导出。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-indigo-600 text-indigo-600 hover:bg-indigo-50"
            >
              <ArrowPathIcon className="w-4 h-4" /> 导出 JSON
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">搜索关键字</label>
            <input
              type="search"
              placeholder="日期 / 菜品 / 餐厅"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">预算模式</label>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">全部</option>
              <option value="balanced">平衡模式</option>
              <option value="saver">节约模式</option>
              <option value="enjoy">享受模式</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center border border-dashed border-gray-200">
          <SparklesIcon className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-800">暂时没有符合条件的历史记录</p>
          <p className="text-gray-600 mt-1">生成新的每日推荐后，这里会自动归档，可按日期或菜品搜索。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((record) => (
            <div key={record.id} className="bg-white rounded-2xl shadow border border-gray-200 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm text-gray-500">{new Date(record.date).toLocaleString()}</p>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {MODE_LABELS[record.mode]} · {record.mealsPerDay} 餐 · {formatCurrency(record.totalSpent)} /{' '}
                    {formatCurrency(record.budget)}
                  </h3>
                </div>
                {onReusePlan && (
                  <button
                    type="button"
                    onClick={() => onReusePlan(record)}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    再来一次同款菜单
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-700 font-semibold">餐次</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-semibold">菜品</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-semibold">餐厅</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-semibold">满意度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {record.slots.map((slot) => (
                      <tr key={slot.slot}>
                        <td className="px-3 py-2 font-medium text-gray-800">{slot.slot}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {slot.recommendation ? slot.recommendation.dishes.map((dish) => dish.name).join('、') : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {slot.recommendation
                            ? Array.from(new Set(slot.recommendation.dishes.map((dish) => dish.restaurant))).join(' / ')
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-indigo-600 font-semibold">
                          {slot.recommendation ? Math.round(slot.recommendation.satisfactionScore) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-sm text-gray-600">
                营养：P {record.macros.protein}g / C {record.macros.carbs}g / F {record.macros.fat}g · 平均满意度{' '}
                {Math.round(record.totalSatisfaction)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyPlanHistory;
