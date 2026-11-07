/** A non-2xx HTTP answer. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Fetches a JSON answer. A non-2xx answer throws an `HttpError`, unless its status is in `answers` (statuses
 * whose body is a valid answer, e.g. a 404 `{found: false}`). Network errors are thrown as they are.
 */
export async function fetchJson<T>(input: string, init: RequestInit & { answers?: number[] } = {}): Promise<T> {
  const { answers = [], ...request } = init;
  const res = await fetch(input, request);
  const body = (await res.json().catch(() => undefined)) as (T & { error?: unknown }) | undefined;
  if (res.ok || answers.includes(res.status)) {
    if (body === undefined) throw new Error(`HTTP ${res.status}: the answer is not JSON`);
    return body;
  }
  throw new HttpError(res.status, typeof body?.error === "string" && body.error ? body.error : `HTTP ${res.status}`);
}
