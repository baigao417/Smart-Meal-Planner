import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GroupMealRecord,
  GroupMealRecordParticipant,
  GroupMenuPlan,
  GroupMemberInput,
} from '../types';
import { siliconflowService } from '../services/siliconflowService';
import { ArrowPathIcon, PlusIcon, SparklesIcon, XMarkIcon } from './Icons';

interface GroupRecommenderProps {
  onSaveGroupMeal: (record: GroupMealRecord) => void;
  groupMeals: GroupMealRecord[];
}

type MemberCard = GroupMemberInput;

type ParticipantRow = {
  id: string;
  name: string;
  score: string;
  comment: string;
};

const generateId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const createMember = (index: number): MemberCard => ({
  id: generateId('member'),
  name: `成员 ${index}`,
  weight: 1,
  split: 1,
  preference: '',
});

const createParticipantRow = (name = ''): ParticipantRow => ({
  id: generateId('participant'),
  name,
  score: '',
  comment: '',
});

const clampNumber = (value: number, min: number, max?: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  const bounded = Math.max(min, value);
  if (typeof max === 'number') {
    return Math.min(max, bounded);
  }
  return bounded;
};

const parseMenuItems = (input: string) => {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [dish, price, rating] = line.split(',').map((part) => part.trim());
      if (!dish) {
        return null;
      }
      const priceValue = Number.isFinite(parseFloat(price)) ? Number(parseFloat(price).toFixed(2)) : 0;
      const ratingValue = Number.isFinite(parseFloat(rating))
        ? clampNumber(parseFloat(rating), 0, 1)
        : 0;
      return {
        dish,
        price: Number(priceValue.toFixed(2)),
        rating: Number(ratingValue.toFixed(2)),
      };
    })
    .filter((item): item is { dish: string; price: number; rating: number } => Boolean(item));
};

const formatCurrency = (value: number | undefined) => `¥${Number(value ?? 0).toFixed(2)}`;

const getToday = () => new Date().toISOString().slice(0, 10);

const MealRecordForm: React.FC<{
  initialParticipants: string[];
  onSave: (record: GroupMealRecord) => void;
  history: GroupMealRecord[];
}> = ({ initialParticipants, onSave, history }) => {
  const [form, setForm] = useState({
    date: getToday(),
    restaurant: '',
    totalPrice: '',
    menuText: '',
    overallFeeling: '',
    notes: '',
  });
  const [rows, setRows] = useState<ParticipantRow[]>(() => [createParticipantRow()]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRows((prev) => {
      if (!initialParticipants.length) {
        return prev.length ? prev : [createParticipantRow()];
      }
      const hasEdits = prev.some((row) => row.score.trim() || row.comment.trim());
      if (hasEdits) {
        return prev;
      }
      return initialParticipants.map((name, index) => ({
        id: prev[index]?.id ?? generateId('participant'),
        name: name || `成员 ${index + 1}`,
        score: '',
        comment: '',
      }));
    });
  }, [initialParticipants]);

  const averageScore = useMemo(() => {
    const scores = rows
      .map((row) => parseFloat(row.score))
      .filter((score) => Number.isFinite(score));
    if (!scores.length) {
      return 0;
    }
    const total = scores.reduce((sum, score) => sum + clampNumber(score, 0, 100), 0);
    return Number((total / scores.length).toFixed(1));
  }, [rows]);

  const handleRowChange = (id: string, field: keyof ParticipantRow, value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, createParticipantRow(`成员 ${prev.length + 1}`)]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const restaurant = form.restaurant.trim();
    const totalPrice = Number(parseFloat(form.totalPrice).toFixed(2));

    if (!restaurant || !Number.isFinite(totalPrice)) {
      setError('请填写餐厅名称和有效的总价。');
      return;
    }

    const participants: GroupMealRecordParticipant[] = [];
    const validScores: number[] = [];

    rows.forEach((row, index) => {
      const name = row.name.trim() || `成员 ${index + 1}`;
      const comment = row.comment.trim();
      const parsedScore = parseFloat(row.score);
      const hasScore = Number.isFinite(parsedScore);
      const numericScore = hasScore ? clampNumber(parsedScore, 0, 100) : 0;
      if (hasScore) {
        validScores.push(numericScore);
      }
      participants.push({
        name,
        score: Number(numericScore.toFixed(1)),
        comment: comment || undefined,
      });
    });

    if (!participants.length) {
      setError('请至少添加一位参与成员。');
      return;
    }

    const menuItems = parseMenuItems(form.menuText);
    const record: GroupMealRecord = {
      id: generateId('group-record'),
      date: form.date,
      restaurant,
      totalPrice: Number(totalPrice.toFixed(2)),
      participants,
      menuItems,
      overallFeeling: form.overallFeeling.trim(),
      averageScore: validScores.length
        ? Number((validScores.reduce((sum, score) => sum + score, 0) / validScores.length).toFixed(1))
        : 0,
      notes: form.notes.trim() || undefined,
    };

    setIsSaving(true);
    try {
      onSave(record);
      setForm((prev) => ({
        ...prev,
        restaurant: '',
        totalPrice: '',
        menuText: '',
        overallFeeling: '',
        notes: '',
      }));
      setRows(() =>
        (initialParticipants.length
          ? initialParticipants.map((name, index) => createParticipantRow(name || `成员 ${index + 1}`))
          : [createParticipantRow()])
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900">聚餐记录</h3>
        <p className="text-gray-600 mt-1">聚餐结束后快速记录菜单、氛围和成员反馈，方便下次复盘。</p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">聚餐日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">餐厅名称</label>
            <input
              type="text"
              value={form.restaurant}
              onChange={(event) => setForm((prev) => ({ ...prev, restaurant: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="例如：小龙坎火锅"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">总价 (¥)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.totalPrice}
              onChange={(event) => setForm((prev) => ({ ...prev, totalPrice: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">参与成员</label>
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(event) => handleRowChange(row.id, 'name', event.target.value)}
                      placeholder={`成员 ${index + 1}`}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.score}
                      onChange={(event) => handleRowChange(row.id, 'score', event.target.value)}
                      placeholder="评分 (0-100)"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={row.comment}
                      onChange={(event) => handleRowChange(row.id, 'comment', event.target.value)}
                      placeholder="评论 / 感受"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="self-start text-sm font-semibold text-rose-600 hover:text-rose-700"
                    disabled={rows.length === 1}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <PlusIcon className="w-4 h-4" /> 添加成员
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">菜品记录</label>
          <textarea
            rows={3}
            value={form.menuText}
            onChange={(event) => setForm((prev) => ({ ...prev, menuText: event.target.value }))}
            placeholder="每行一个菜：菜名, 价格, 评分(0~1)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">聚餐感受 (整体)</label>
          <textarea
            rows={2}
            value={form.overallFeeling}
            onChange={(event) => setForm((prev) => ({ ...prev, overallFeeling: event.target.value }))}
            placeholder="气氛、服务、值得复刻的亮点"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">备注</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="服务态度 / 下次想尝试的新品"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <span>平均分（实时计算）：<span className="font-semibold text-gray-900">{averageScore}</span></span>
          {error && <span className="text-rose-600">{error}</span>}
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white shadow hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {isSaving ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
          <span>{isSaving ? '保存中…' : '保存聚餐记录'}</span>
        </button>
      </form>

      {history.length > 0 && (
        <div className="space-y-4 pt-4">
          <h4 className="text-lg font-semibold text-gray-900">历史记录</h4>
          <div className="space-y-3">
            {history.map((record) => (
              <div key={record.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{new Date(record.date).toLocaleDateString()}</p>
                    <p className="text-lg font-semibold text-gray-900">{record.restaurant}</p>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>总价：{formatCurrency(record.totalPrice)}</p>
                    <p>平均分：{record.averageScore}</p>
                  </div>
                </div>
                {record.menuItems?.length ? (
                  <div className="mt-3 space-y-1 text-sm text-gray-700">
                    <p className="font-semibold text-gray-800">菜品记录</p>
                    <ul className="space-y-1">
                      {record.menuItems.map((item, index) => (
                        <li key={`${record.id}-dish-${index}`}>{item.dish} · {formatCurrency(item.price)} · 评分 {item.rating}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {record.participants?.length ? (
                  <div className="mt-3 space-y-1 text-sm text-gray-700">
                    <p className="font-semibold text-gray-800">参与成员</p>
                    <ul className="space-y-1">
                      {record.participants.map((participant, index) => {
                        const legacy = participant as unknown as {
                          score?: number;
                          personalScore?: number;
                          comment?: string;
                          notes?: string;
                        };
                        const displayScore =
                          typeof legacy.score === 'number'
                            ? legacy.score
                            : typeof legacy.personalScore === 'number'
                              ? legacy.personalScore
                              : '—';
                        const displayComment = (legacy.comment ?? legacy.notes ?? '').trim();
                        return (
                          <li key={`${record.id}-participant-${index}`}>
                            {participant.name} · {displayScore}
                            {displayComment ? ` · ${displayComment}` : ''}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {record.overallFeeling && (
                  <p className="mt-3 text-sm text-gray-600">聚餐感受：{record.overallFeeling}</p>
                )}
                {record.notes && <p className="mt-1 text-sm text-gray-500">备注：{record.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const GroupRecommender: React.FC<GroupRecommenderProps> = ({ onSaveGroupMeal, groupMeals }) => {
  const [members, setMembers] = useState<MemberCard[]>(() => [createMember(1)]);
  const [plan, setPlan] = useState<GroupMenuPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMemberNames, setLastMemberNames] = useState<string[]>(() =>
    groupMeals[0]?.participants?.map((participant) => participant.name).filter(Boolean) ?? []
  );

  useEffect(() => {
    if (!lastMemberNames.length && groupMeals.length) {
      setLastMemberNames(groupMeals[0].participants?.map((participant) => participant.name).filter(Boolean) ?? []);
    }
  }, [groupMeals, lastMemberNames.length]);

  const updateMember = (id: string, field: keyof MemberCard, value: string) => {
    setMembers((prev) =>
      prev.map((member) => {
        if (member.id !== id) {
          return member;
        }
        if (field === 'weight' || field === 'split') {
          const parsed = parseFloat(value);
          const numeric = clampNumber(parsed, field === 'weight' ? 0.1 : 0);
          const fallback = 1;
          const stored = Number.isFinite(parsed) ? Number(numeric.toFixed(2)) : fallback;
          return { ...member, [field]: stored };
        }
        return { ...member, [field]: value };
      })
    );
  };

  const addMember = () => {
    setMembers((prev) => [...prev, createMember(prev.length + 1)]);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => (prev.length > 1 ? prev.filter((member) => member.id !== id) : prev));
  };

  const handleGenerate = useCallback(async () => {
    setError(null);
    setIsGenerating(true);
    setPlan(null);
    try {
      const sanitized = members.map((member, index) => ({
        name: member.name.trim() || `成员 ${index + 1}`,
        weight: Number.isFinite(member.weight) ? member.weight : 1,
        split: Number.isFinite(member.split) ? member.split : 1,
        preference: member.preference.trim(),
      }));
      const planResult = await siliconflowService.generateGroupMenuPlan(sanitized);
      setPlan(planResult);
      setLastMemberNames(sanitized.map((member) => member.name));
    } catch (planError) {
      console.error(planError);
      setError('生成菜单时出现问题，请稍后再试。');
    } finally {
      setIsGenerating(false);
    }
  }, [members]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <section className="space-y-6 rounded-2xl bg-white p-6 shadow-lg">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold text-gray-900">Group Meal Mode</h2>
          <p className="text-gray-600">添加成员信息，生成兼顾偏好与预算的聚餐菜单。</p>
        </div>
        <div className="space-y-4">
          {members.map((member, index) => (
            <div key={member.id} className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex-1 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">成员名称</label>
                    <input
                      type="text"
                      value={member.name}
                      onChange={(event) => updateMember(member.id, 'name', event.target.value)}
                      placeholder={`成员 ${index + 1}`}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">权重</label>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={member.weight}
                      onChange={(event) => updateMember(member.id, 'weight', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">分摊比例</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={member.split}
                      onChange={(event) => updateMember(member.id, 'split', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  className="flex items-center gap-1 text-sm font-semibold text-rose-600 hover:text-rose-700"
                  disabled={members.length === 1}
                >
                  <XMarkIcon className="h-4 w-4" /> 移除
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">个人偏好 / 禁忌 / 想尝试的菜</label>
                <textarea
                  rows={2}
                  value={member.preference}
                  onChange={(event) => updateMember(member.id, 'preference', event.target.value)}
                  placeholder="例如：不吃辣，偏爱鱼类"
                  className="w-full rounded-lg border border-dashed border-indigo-300 bg-white px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addMember}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            <PlusIcon className="h-4 w-4" /> 添加自定义成员
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white shadow hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {isGenerating ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : null}
            {isGenerating ? '生成中…' : '生成小组菜单'}
          </button>
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
        {plan && (
          <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div>
              <h3 className="text-xl font-semibold text-indigo-900">推荐菜单</h3>
              <p className="mt-1 text-sm text-indigo-800">{plan.summary}</p>
            </div>
            <ul className="space-y-2">
              {plan.dishes.map((dish, index) => (
                <li key={`${dish.name}-${index}`} className="rounded-lg bg-white/70 p-3 text-sm text-indigo-900 shadow-sm">
                  <p className="font-semibold">{dish.name}</p>
                  <p className="mt-1 text-indigo-800">{dish.description}</p>
                  {typeof dish.estimatedPrice === 'number' && (
                    <p className="mt-1 text-xs text-indigo-700">预估价格：{formatCurrency(dish.estimatedPrice)}</p>
                  )}
                </li>
              ))}
            </ul>
            {plan.tips && <p className="text-sm text-indigo-800">提示：{plan.tips}</p>}
          </div>
        )}
      </section>

      <section className="space-y-6 rounded-2xl bg-white p-6 shadow-lg">
        <MealRecordForm initialParticipants={lastMemberNames} onSave={onSaveGroupMeal} history={groupMeals} />
      </section>
    </div>
  );
};

export default GroupRecommender;
