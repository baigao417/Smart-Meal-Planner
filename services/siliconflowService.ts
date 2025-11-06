import { Dish, GroupMenuPlan, Macros, UserProfile } from '../types';

type VisionContentPart =
  | string
  | {
      type: 'text' | 'input_text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: { url: string };
    };

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: VisionContentPart | VisionContentPart[];
};

type ProxyPayload = {
  messages: ChatMessage[];
  responseFormat?: unknown;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stop?: string | string[];
};

type AiAvailability = {
  available: boolean;
  message?: string;
  model?: string;
};

class SiliconFlowService {
  private extractJsonPayload(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      const objectStart = trimmed.indexOf('{');
      const objectEnd = trimmed.lastIndexOf('}');
      if (objectStart !== -1 && objectEnd > objectStart) {
        const candidate = trimmed.slice(objectStart, objectEnd + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // continue searching
        }
      }

      const arrayStart = trimmed.indexOf('[');
      const arrayEnd = trimmed.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        const candidate = trimmed.slice(arrayStart, arrayEnd + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  private parseJsonResponse<T>(raw: string): T {
    const payload = this.extractJsonPayload(raw);
    if (!payload) {
      throw new Error('AI 服务未返回有效的 JSON 数据。');
    }

    return JSON.parse(payload) as T;
  }

  private async requestContent(payload: ProxyPayload): Promise<string> {
    try {
      const response = await fetch('/api/siliconflow-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          (typeof errorBody?.message === 'string' && errorBody.message) || response.statusText;
        const details = typeof errorBody?.details === 'string' ? `（${errorBody.details}）` : '';
        throw new Error(`SiliconFlow proxy error: ${message}${details}`);
      }

      const data = await response.json();
      const { content } = data ?? {};
      if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim();
      }

      throw new Error('SiliconFlow proxy returned an empty response.');
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error('SiliconFlow proxy unreachable.');
    }
  }

  private clampScore(value: number): number {
    if (Number.isNaN(value)) return 75;
    return Math.max(0, Math.min(100, value));
  }

  private heuristicMacros(name: string, restaurant: string): Macros {
    const normalized = `${restaurant} ${name}`.toLowerCase();
    if (/沙拉|salad|轻食/.test(normalized)) {
      return { protein: 28, carbs: 18, fat: 12 };
    }
    if (/饭|rice|盖饭/.test(normalized)) {
      return { protein: 24, carbs: 58, fat: 16 };
    }
    if (/面|粉|noodle/.test(normalized)) {
      return { protein: 22, carbs: 62, fat: 14 };
    }
    if (/汤|soup/.test(normalized)) {
      return { protein: 16, carbs: 20, fat: 8 };
    }
    if (/烤|烧|roast|grill/.test(normalized)) {
      return { protein: 32, carbs: 18, fat: 20 };
    }
    return { protein: 25, carbs: 45, fat: 15 };
  }

  async getPreferenceScore(dishes: Dish[], profile: UserProfile): Promise<number> {
    const scores = await this.getBulkPreferenceScores([dishes], profile);
    return scores[0] ?? 80;
  }

  async getBulkPreferenceScores(meals: Dish[][], profile: UserProfile): Promise<number[]> {
    if (meals.length === 0) return [];

    const profileSummary = `用户饮食目标：${profile.dietGoal}\n当前体重：${profile.weightKg}kg\n单日预算：¥${profile.budget}\n偏好：${profile.preferences || '未提供'}`;

    const mealDescriptions = meals.map((meal, index) => {
      const totals = meal.reduce<Macros>((acc, dish) => ({
        protein: acc.protein + dish.protein,
        carbs: acc.carbs + dish.carbs,
        fat: acc.fat + dish.fat,
      }), { protein: 0, carbs: 0, fat: 0 });

      const totalPrice = meal.reduce((sum, dish) => sum + dish.price, 0);

      const dishLines = meal.map(dish =>
        `${dish.name}（${dish.restaurant}，¥${dish.price.toFixed(2)}，${dish.category}；P${Math.round(dish.protein)}g/C${Math.round(dish.carbs)}g/F${Math.round(dish.fat)}g）`
      ).join('；');

      return `餐单${index + 1}：总价约¥${totalPrice.toFixed(2)}，汇总营养≈P${Math.round(totals.protein)}g/C${Math.round(totals.carbs)}g/F${Math.round(totals.fat)}g。包含：${dishLines}`;
    }).join('\n');

    try {
      const content = await this.requestContent({
        temperature: 0.2,
        maxTokens: 600,
        messages: [
          {
            role: 'system',
            content:
              '你是一名资深的营养与口味顾问，需要为大学生快速评估餐单。综合口味偏好、营养平衡、预算与日常消费场景，给出0-100的整数分数，100代表最契合。必须只返回JSON对象。',
          },
          {
            role: 'user',
            content: `${profileSummary}\n\n请为以下餐单评分：\n${mealDescriptions}\n\n输出示例：{"scores":[90,75,...]}`,
          },
        ],
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'meal_scores',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                scores: {
                  type: 'array',
                  minItems: meals.length,
                  maxItems: meals.length,
                  items: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 100,
                  },
                },
              },
              required: ['scores'],
            },
          },
        },
      });

      const parsed = this.parseJsonResponse<{ scores?: number[] }>(content);
      if (Array.isArray(parsed.scores) && parsed.scores.length === meals.length) {
        return parsed.scores.map((score) => this.clampScore(Number(score)));
      }

      console.warn('Unexpected SiliconFlow score payload, falling back.');
    } catch (error) {
      console.error('Failed to fetch SiliconFlow scores:', error);
    }

    return meals.map(() => 78);
  }

  async generateRecommendationText(meal: { dishes: Dish[]; macros: Macros }, profile: UserProfile): Promise<string> {
    const dishList = meal.dishes.map(d => `${d.name}（${d.restaurant}）`).join('、');

    try {
      const content = await this.requestContent({
        temperature: 0.7,
        maxTokens: 320,
        messages: [
          {
            role: 'system',
            content:
              '你是一名注重效率的营养教练，擅长给FIRE（财务自由提前退休）理念的用户下达行动建议。请用2-3句中文，语气积极务实。',
          },
          {
            role: 'user',
            content: `用户目标：${profile.dietGoal}\n体重：${profile.weightKg}kg\n偏好：${profile.preferences}\n推荐餐单：${dishList}\n营养概况：蛋白${Math.round(meal.macros.protein)}g，碳水${Math.round(meal.macros.carbs)}g，脂肪${Math.round(meal.macros.fat)}g。\n请强调餐单如何节省时间并保持目标节奏。`,
          },
        ],
        stop: ['```'],
      });

      return content;
    } catch (error) {
      console.error('Failed to generate recommendation text:', error);
      return '这份餐单营养均衡、执行难度低，能帮你节省选餐时间，把精力留给更重要的目标。';
    }
  }

  async generateGroupMenuPlan(
    members: { name: string; weight: number; split: number; preference: string }[]
  ): Promise<GroupMenuPlan> {
    if (members.length === 0) {
      return {
        summary: '请至少添加一位成员以生成聚餐菜单。',
        dishes: [],
      };
    }

    const payload = { group: members };
    const toNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
      }
      if (typeof value === 'string') {
        const numeric = parseFloat(value);
        return Number.isFinite(numeric) ? numeric : undefined;
      }
      return undefined;
    };

    try {
      const content = await this.requestContent({
        temperature: 0.5,
        maxTokens: 600,
        messages: [
          {
            role: 'system',
            content:
              '你是一名聚餐规划助手。根据提供的成员权重、分摊比例和偏好，输出一个JSON格式的聚餐菜单，包含简短总结、菜品清单和可选贴士。',
          },
          {
            role: 'user',
            content: JSON.stringify(payload, null, 2),
          },
        ],
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'group_menu_plan',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                summary: { type: 'string' },
                tips: { type: 'string' },
                dishes: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      estimatedPrice: { type: 'number' },
                      estimated_price: { type: 'number' },
                      reason: { type: 'string' },
                      dish: { type: 'string' },
                    },
                    required: ['name', 'description'],
                  },
                },
              },
              required: ['summary', 'dishes'],
            },
          },
        },
      });

      const parsed = this.parseJsonResponse<{
        summary?: string;
        dishes?: Array<{
          name?: string;
          dish?: string;
          description?: string;
          reason?: string;
          estimatedPrice?: number;
          estimated_price?: number;
          price?: number;
        }>;
        tips?: string;
      }>(content);

      const dishes = Array.isArray(parsed.dishes)
        ? parsed.dishes
            .map((item) => {
              const name = (item.name || item.dish || '').trim();
              const description = (item.description || item.reason || '').trim();
              if (!name || !description) {
                return null;
              }
              const estimatedPrice =
                toNumber(item.estimatedPrice) ?? toNumber(item.estimated_price) ?? toNumber(item.price);
              return {
                name,
                description,
                estimatedPrice: estimatedPrice !== undefined ? Number(estimatedPrice.toFixed(2)) : undefined,
              };
            })
            .filter((dish): dish is GroupMenuPlan['dishes'][number] => Boolean(dish))
        : [];

      if (!dishes.length) {
        throw new Error('AI 响应缺少菜品信息。');
      }

      return {
        summary: parsed.summary?.trim() || '这份菜单根据成员偏好生成，可作为聚餐决策的起点。',
        dishes,
        tips: parsed.tips?.trim(),
      };
    } catch (error) {
      console.error('Failed to generate group menu plan:', error);
      return {
        summary: '以下菜单结合了成员偏好，可在实际点餐时按需调整。',
        dishes: members.map((member, index) => ({
          name: `${member.name || '成员'}偏好菜品 ${index + 1}`,
          description: member.preference || '根据该成员的备注挑选一款口碑菜品。',
        })),
      };
    }
  }

  async generateGroupRecommendationText(
    meal: { dishes: Dish[] },
    participants: { user: UserProfile; weight: number }[]
  ): Promise<string> {
    const dishList = meal.dishes.map(d => `${d.name}（${d.restaurant}）`).join('、');
    const participantSummary = participants
      .map(p => `- ${p.user.name}：权重${p.weight}，目标${p.user.dietGoal}，偏好${p.user.preferences || '未填写'}`)
      .join('\n');

    try {
      const content = await this.requestContent({
        temperature: 0.6,
        maxTokens: 280,
        messages: [
          {
            role: 'system',
            content: '你是一名会议用餐协调员，需要总结餐单如何满足不同成员的核心诉求，语气友好简洁。',
          },
          {
            role: 'user',
            content: `以下成员要共进餐食：\n${participantSummary}\n\n推荐餐单：${dishList}\n请说明该搭配兼顾了哪些关键偏好，并给出鼓励。`,
          },
        ],
        stop: ['```'],
      });

      return content;
    } catch (error) {
      console.error('Failed to generate group recommendation text:', error);
      return '这份搭配兼顾了大家的核心诉求，味道和营养都照顾到位，可以放心开吃！';
    }
  }

  async estimateDishMacros(dishName: string, restaurantName: string): Promise<Macros> {
    try {
      const content = await this.requestContent({
        temperature: 0.4,
        maxTokens: 320,
        messages: [
          {
            role: 'system',
            content: '你是一名专业营养师，请根据常见食材估算单人份菜品的宏量营养素，单位为克。务必只输出JSON。',
          },
          {
            role: 'user',
            content: `菜品名称：${dishName}\n餐厅或档口：${restaurantName}\n请估算蛋白质、碳水化合物、脂肪（克），并给出现实可行的校园档口水平。`,
          },
        ],
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'dish_macros',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                protein: { type: 'number', minimum: 0 },
                carbs: { type: 'number', minimum: 0 },
                fat: { type: 'number', minimum: 0 },
              },
              required: ['protein', 'carbs', 'fat'],
            },
          },
        },
      });

      const parsed = this.parseJsonResponse<Macros>(content);
      if (
        typeof parsed.protein === 'number' &&
        typeof parsed.carbs === 'number' &&
        typeof parsed.fat === 'number'
      ) {
        return parsed;
      }

      throw new Error('AI 响应缺少必要的营养字段。');
    } catch (error) {
      console.error('Failed to estimate dish macros:', error);
      console.warn('使用经验值估算菜品营养信息。');
      return this.heuristicMacros(dishName, restaurantName);
    }
  }

  async parseDishesFromText(text: string): Promise<Partial<Dish>[]> {
    try {
      const content = await this.requestContent({
        temperature: 0.3,
        maxTokens: 1100,
        messages: [
          {
            role: 'system',
            content:
              '你是智能菜谱整理助手，需要从文本中提取菜品信息，并估算价格与营养。务必输出JSON数组，不允许出现额外说明。',
          },
          {
            role: 'user',
            content:
              '示例文本：\n烤鸡胸, 健身餐厅, 26, 38, 6, 8, 肉蛋\n牛肉粉丝汤|一食堂|18|22|28|9|汤羹\n\n请将其转换为JSON数组。',
          },
          {
            role: 'assistant',
            content:
              '[{"name":"烤鸡胸","restaurant":"健身餐厅","price":26,"protein":38,"carbs":6,"fat":8,"category":"肉蛋"},{"name":"牛肉粉丝汤","restaurant":"一食堂","price":18,"protein":22,"carbs":28,"fat":9,"category":"汤羹"}]',
          },
          {
            role: 'user',
            content: `请解析以下文本，列出每道菜的名称、餐厅、估算价格（人民币）、蛋白质/碳水/脂肪（克）以及分类（主食/肉蛋/蔬菜/汤羹/其他）。如遇无法识别的字段请合理估算。\n文本：\n${text}`,
          },
        ],
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'parsed_dishes',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  restaurant: { type: 'string' },
                  price: { type: 'number', minimum: 0 },
                  protein: { type: 'number', minimum: 0 },
                  carbs: { type: 'number', minimum: 0 },
                  fat: { type: 'number', minimum: 0 },
                  category: {
                    type: 'string',
                    enum: ['主食', '肉蛋', '蔬菜', '汤羹', '其他'],
                  },
                },
                required: ['name', 'restaurant', 'price', 'protein', 'carbs', 'fat', 'category'],
              },
            },
          },
        },
      });

      const parsed = this.parseJsonResponse<Partial<Dish>[]>(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }

      throw new Error('AI 响应不是有效的菜品数组。');
    } catch (error) {
      console.error('Failed to parse dish list:', error);
      const message =
        error instanceof Error ? error.message : 'AI 服务暂不可用，请稍后再试。';
      throw new Error(`AI 解析失败：${message}`);
    }
  }

  async ocrImagesToText(imageDataUrls: string[]): Promise<string> {
    if (imageDataUrls.length === 0) {
      return '';
    }

    const contentBlocks: VisionContentPart[] = [
      {
        type: 'text',
        text: '以下是餐单的截图，请逐页识别菜品名称、价格和餐厅信息，用换行分隔每道菜，若识别失败请标注未识别。',
      },
    ];

    imageDataUrls.forEach((url, index) => {
      contentBlocks.push({ type: 'text', text: `第${index + 1}页：` });
      contentBlocks.push({ type: 'image_url', image_url: { url } });
    });

    try {
      const content = await this.requestContent({
        model: 'deepseek-ai/Janus-Pro-7B',
        temperature: 0.1,
        maxTokens: 900,
        messages: [
          {
            role: 'system',
            content:
              '你是DeepSeek的OCR整理助手，请提取截图中的中文菜单文本。尽量保持原有顺序并输出干净的纯文本，每道菜独占一行。',
          },
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
        stop: ['```'],
      });

      return content.trim();
    } catch (error) {
      console.error('Failed to run DeepSeek OCR:', error);
      return '';
    }
  }

  async checkAvailability(): Promise<AiAvailability> {
    try {
      const response = await fetch('/api/ai-status');
      const data = (await response.json().catch(() => ({}))) as AiAvailability & { message?: string };

      if (!response.ok) {
        return {
          available: false,
          message: data?.message || '无法检查 AI 服务状态，请稍后重试。',
        };
      }

      return {
        available: Boolean(data?.available),
        message: data?.message,
        model: data?.model,
      };
    } catch (error) {
      console.error('AI availability check failed:', error);
      return {
        available: false,
        message: '无法连接到 AI 状态检查，请确认部署已配置 API Key。',
      };
    }
  }

  async recommendGroupDining(params: {
    partySize: number;
    taste: string;
    budget: number;
  }): Promise<{
    restaurant: string;
    headline: string;
    perPersonBudget: number;
    dishes: string[];
    steps: string[];
    summary: string;
  }> {
    try {
      const content = await this.requestContent({
        temperature: 0.6,
        maxTokens: 650,
        messages: [
          {
            role: 'system',
            content:
              '你是高校周边的聚餐策划助手，请在3步内给出餐厅方案。输出需为JSON，包含餐厅、亮点标题、人均预算、推荐菜品列表、三步行动清单和一句总结。',
          },
          {
            role: 'user',
            content: `人数：${params.partySize}\n预算：¥${params.budget}/人\n口味偏好：${params.taste || '不限'}\n请推荐一个适合聚餐的地点。`,
          },
        ],
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'group_dining_plan',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                restaurant: { type: 'string' },
                headline: { type: 'string' },
                perPersonBudget: { type: 'number' },
                dishes: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string' },
                },
                steps: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: { type: 'string' },
                },
                summary: { type: 'string' },
              },
              required: ['restaurant', 'headline', 'perPersonBudget', 'dishes', 'steps', 'summary'],
            },
          },
        },
      });

      const parsed = this.parseJsonResponse<{
        restaurant?: string;
        headline?: string;
        perPersonBudget?: number;
        dishes?: string[];
        steps?: string[];
        summary?: string;
      }>(content);

      if (
        parsed &&
        typeof parsed.restaurant === 'string' &&
        typeof parsed.headline === 'string' &&
        Array.isArray(parsed.dishes) &&
        Array.isArray(parsed.steps) &&
        parsed.dishes.length > 0 &&
        parsed.steps.length === 3 &&
        typeof parsed.perPersonBudget === 'number'
      ) {
        return {
          restaurant: parsed.restaurant,
          headline: parsed.headline,
          perPersonBudget: parsed.perPersonBudget,
          dishes: parsed.dishes,
          steps: parsed.steps,
          summary: parsed.summary ?? '祝你们聚餐愉快，轻松搞定行程。',
        };
      }

      throw new Error('响应缺少必需字段');
    } catch (error) {
      console.error('Group dining assistant failed:', error);
      return {
        restaurant: '校园热门聚会地',
        headline: '环境轻松，有包间，适合朋友聚会',
        perPersonBudget: params.budget,
        dishes: ['经典双拼锅底', '招牌下酒小菜', '水果茶续杯'],
        steps: ['提前电话预约包间', '抵达后先点锅底及饮品', '用餐后AA分账，拍照留念'],
        summary: '根据你的预算和口味，这家店口碑稳定且交通方便，三步即可安排妥当。',
      };
    }
  }
}

export const siliconflowService = new SiliconFlowService();
