const DEFAULT_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? "30000");
const DEFAULT_RETRY_COUNT = Number(process.env.NEXT_PUBLIC_API_RETRY_COUNT ?? "2");
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export type FetchWithRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  requestId?: string;
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRY_COUNT;
  const headers = new Headers(init.headers);
  if (options.requestId) headers.set("X-Request-ID", options.requestId);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
        return response;
      }
      await sleep(Math.min(1500, 250 * 2 ** attempt));
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(Math.min(1500, 250 * 2 ** attempt));
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Network request failed for ${url}`);
}
