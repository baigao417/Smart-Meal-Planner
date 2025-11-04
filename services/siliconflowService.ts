import { Dish, Macros, UserProfile } from '../types';

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
      const message =
        error instanceof Error ? error.message : 'AI 服务暂不可用，请稍后重试或手动填写营养信息。';
      throw new Error(`AI 估算失败：${message}`);
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
}

export const siliconflowService = new SiliconFlowService();
