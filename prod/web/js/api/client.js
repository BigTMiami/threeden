// @ts-check
/**
 * client.js — talking to the 3den API (same site, under /api).
 *
 *   const me = await api('/v1/me');
 *   await api('/v1/auth/signin', { method: 'POST', body: { login, password } });
 *
 * The session is an httpOnly cookie the browser sends by itself; page
 * scripts never see it. Every failure is an ApiError with a message that can
 * be shown as it is.
 */

export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status, or 0 if the server couldn't be reached
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * @param {string} path  e.g. '/v1/me'
 * @param {{ method?: string, body?: unknown, timeoutMs?: number }} [options]
 * @returns {Promise<any>} the JSON answer, or null for "204 No Content"
 */
export async function api(path, { method = 'GET', body = undefined, timeoutMs = 15000 } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, 'Couldn’t reach the 3den server.');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageFrom(data, response.status));
  return data;
}

/** FastAPI says { detail: 'text' } or { detail: [{ msg }, …] }. */
function messageFrom(data, status) {
  const detail = data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail.map((d) => d.msg).join(' ');
  if (status === 429) return 'Too many tries. Wait a few minutes and try again.';
  if (status >= 500) return 'The 3den server had a problem. Try again in a moment.';
  return `The server said no (${status}).`;
}
