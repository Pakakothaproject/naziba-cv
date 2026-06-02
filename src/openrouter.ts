import { config } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: string,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 120000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function chatCompletions(req: ChatRequest): Promise<ChatResponse> {
  if (!config.apiKey) {
    throw new OpenRouterError(401, 'OpenRouter API key not configured. Set OPENROUTER_API_KEY in .env');
  }

  const res = await fetchWithTimeout(`${config.openrouterBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://careercraft.app',
      'X-Title': 'CareerCraft AI',
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? config.temperature,
      max_tokens: req.max_tokens ?? config.maxTokens,
      stream: false,
    }),
    timeout: 180000,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new OpenRouterError(res.status, `OpenRouter API error: ${res.status}`, text);
  }

  return res.json() as Promise<ChatResponse>;
}

export async function chatCompletionsStream(
  req: ChatRequest,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void,
): Promise<void> {
  if (!config.apiKey) {
    onError(new OpenRouterError(401, 'OpenRouter API key not configured'));
    return;
  }

  try {
    const res = await fetchWithTimeout(`${config.openrouterBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://careercraft.app',
        'X-Title': 'CareerCraft AI',
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? config.temperature,
        max_tokens: req.max_tokens ?? config.maxTokens,
        stream: true,
      }),
      timeout: 300000,
    });

    if (!res.ok) {
      const text = await res.text();
      onError(new OpenRouterError(res.status, `OpenRouter API error: ${res.status}`, text));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError(new Error('Response body not readable'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
