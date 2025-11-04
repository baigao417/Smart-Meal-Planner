import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_MODEL = process.env.SILICONFLOW_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn';

function extractContent(choiceContent: unknown): string {
  if (typeof choiceContent === 'string') {
    return choiceContent;
  }

  if (Array.isArray(choiceContent)) {
    return choiceContent
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: string }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }

  if (choiceContent && typeof choiceContent === 'object' && 'text' in choiceContent) {
    const text = (choiceContent as { text?: string }).text;
    return typeof text === 'string' ? text : '';
  }

  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'SILICONFLOW_API_KEY is not configured on the server.' });
  }

  const { messages, responseFormat, temperature, maxTokens, model, stop } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'messages array is required.' });
  }

  const payload: Record<string, unknown> = {
    model: typeof model === 'string' && model.length > 0 ? model : DEFAULT_MODEL,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    max_tokens: typeof maxTokens === 'number' ? maxTokens : 1024,
    stream: false,
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  if (Array.isArray(stop) || typeof stop === 'string') {
    payload.stop = stop;
  }

  try {
    const upstreamResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return res.status(upstreamResponse.status).json({
        message: 'SiliconFlow API request failed.',
        details: errorText,
      });
    }

    const data = await upstreamResponse.json();
    const content = extractContent(data?.choices?.[0]?.message?.content ?? '');

    return res.status(200).json({
      content,
      raw: data,
      model: payload.model,
    });
  } catch (error) {
    console.error('SiliconFlow proxy error:', error);
    return res.status(500).json({ message: 'Unexpected error while contacting SiliconFlow.', error: String(error) });
  }
}
