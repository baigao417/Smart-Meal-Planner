import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_MODEL = process.env.SILICONFLOW_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ available: false, message: 'Method Not Allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      available: false,
      message: 'SILICONFLOW_API_KEY 未配置，请在 Vercel 项目设置中添加后重新部署。',
    });
  }

  try {
    const upstream = await fetch(`${BASE_URL}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => upstream.statusText);
      return res.status(200).json({
        available: false,
        message: `无法连接 SiliconFlow 接口：${detail}`,
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      available: true,
      model: DEFAULT_MODEL,
      message: 'SiliconFlow API connected.',
    });
  } catch (error) {
    return res.status(200).json({
      available: false,
      message: `检查 SiliconFlow 状态时出错：${String(error)}`,
    });
  }
}
