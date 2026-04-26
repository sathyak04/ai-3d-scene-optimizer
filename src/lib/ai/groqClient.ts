import { aiResponseSchema, type AIResponse } from './responseSchema';
import {
  SYSTEM_PROMPT,
  buildContext,
  type TargetPlatform,
  type CurrentStateContext,
} from './prompt';
import type { SceneAnalysis } from '@/lib/analysis/types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Sentinel error thrown when the live AI is intentionally disabled. The
 * recommendation hook catches this and falls back to the cached responses
 * silently — distinct from a real network/auth failure.
 */
export class GroqDisabledError extends Error {
  constructor() {
    super('Groq disabled by user');
    this.name = 'GroqDisabledError';
  }
}

export async function getOptimizationRecommendation(
  analysis: SceneAnalysis,
  target: TargetPlatform,
  signal?: AbortSignal,
  current?: CurrentStateContext
): Promise<AIResponse> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GROQ_API_KEY not set in .env');
  }

  const context = buildContext(analysis, target, current);
  const userMessage = `Analyze this 3D asset for the target platform.\n\n${JSON.stringify(context, null, 2)}`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Groq');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Groq returned non-JSON content: ${content.slice(0, 200)}`);
  }

  const validation = aiResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `Groq response failed schema validation: ${validation.error.message}`
    );
  }
  return validation.data;
}
