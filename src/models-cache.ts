import { config } from './config.js';

export interface OpenRouterModel {
  id: string;
  name: string;
  created: number;
  description?: string;
  context_length: number;
  max_completion_tokens?: number;
  pricing: {
    prompt: string;
    completion: string;
    image: string;
    request: string;
  };
  architecture?: {
    modality: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  supported_parameters?: string[];
}

let cachedModels: OpenRouterModel[] | null = null;
let lastFetch = 0;
let fetchInProgress: Promise<OpenRouterModel[]> | null = null;

export async function fetchModels(force = false): Promise<OpenRouterModel[]> {
  const now = Date.now();

  if (!force && cachedModels && now - lastFetch < config.cacheTtlMs) {
    return cachedModels;
  }

  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = (async () => {
    try {
      const res = await fetch(`${config.openrouterBase}/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter models API returned ${res.status}: ${text}`);
      }

      const json = await res.json() as { data: OpenRouterModel[] };
      cachedModels = json.data;
      lastFetch = now;
      console.log(`📦 Fetched ${cachedModels.length} models from OpenRouter`);
      return cachedModels;
    } catch (err) {
      if (cachedModels) {
        console.warn('⚠  Failed to refresh models, using cache:', (err as Error).message);
        return cachedModels;
      }
      throw err;
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
}

export function classifyModel(model: OpenRouterModel): string[] {
  const tags: string[] = [];
  const id = model.id.toLowerCase();
  const name = (model.name || '').toLowerCase();

  if (id.includes('free') || id.endsWith(':free')) tags.push('free');
  if (parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0) {
    tags.push('free');
  }

  if (id.includes('flash') || name.includes('flash')) tags.push('fast');
  if (id.includes('pro') || name.includes('pro') || id.includes('sonnet') || id.includes('opus')) {
    tags.push('premium');
  }
  if (id.includes('mini') || name.includes('mini') || id.includes('small') || name.includes('small')) {
    tags.push('lightweight');
  }
  if (id.includes('reason') || id.includes('think') || name.includes('reason') || name.includes('think')) {
    tags.push('reasoning');
  }
  if (id.includes('vision') || model.architecture?.modality?.includes('image')) {
    tags.push('vision');
  }
  if (model.context_length >= 100000) tags.push('long-context');

  const params = model.supported_parameters || [];
  if (params.includes('tools') || params.includes('tool_choice')) tags.push('tool-supported');

  const promptPrice = parseFloat(model.pricing.prompt);
  const completionPrice = parseFloat(model.pricing.completion);
  if (promptPrice < 0.5 && completionPrice < 2) tags.push('budget');
  if (promptPrice >= 3 || completionPrice >= 15) tags.push('expensive');

  return tags;
}
