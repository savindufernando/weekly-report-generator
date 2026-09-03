import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

/** Uniform error body produced by the backend for every failure. */
export interface ApiErrorBody {
  detail: string;
  code: string;
  request_id?: string | null;
  context?: Record<string, unknown>;
}

/** Normalised error every component sees — never a raw AxiosError. */
export class ApiError extends Error {
  // Declared explicitly rather than as constructor parameter properties:
  // TypeScript's `erasableSyntaxOnly` (on by default in this template) forbids
  // the shorthand, since it emits runtime code rather than erasing cleanly.
  status: number;
  detail: string;
  code: string;
  requestId?: string | null;
  context?: Record<string, unknown>;

  constructor(
    status: number,
    detail: string,
    code: string,
    requestId?: string | null,
    context?: Record<string, unknown>,
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.requestId = requestId;
    this.context = context;
  }

  /** Per-field errors from a 422, ready to map onto a form. */
  get fieldErrors(): { field: string; message: string }[] {
    const errs = this.context?.errors;
    return Array.isArray(errs) ? (errs as { field: string; message: string }[]) : [];
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;

    const ax = error as AxiosError<ApiErrorBody>;
    if (ax?.response) {
      const b = ax.response.data;
      return new ApiError(
        ax.response.status,
        b?.detail ?? 'Request failed',
        b?.code ?? 'http_error',
        b?.request_id,
        b?.context,
      );
    }
    if (ax?.code === 'ECONNABORTED') {
      return new ApiError(0, 'The request timed out. Please try again.', 'timeout');
    }
    return new ApiError(0, 'Cannot reach the server. Check your connection.', 'network_error');
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  // Sends the HttpOnly refresh cookie on same-site and CORS-credentialed calls.
  withCredentials: true,
  timeout: 20_000,
});

/*
 * The access token lives in memory, never localStorage: anything in
 * localStorage is readable by any injected script. It dies with the tab, and
 * the HttpOnly refresh cookie is what restores the session.
 */
let accessToken: string | null = null;
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const getAccessToken = (): string | null => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

type Retriable = AxiosRequestConfig & { _retried?: boolean };

/*
 * Single-flight refresh: ten parallel 401s must trigger ONE refresh, not ten.
 * Every waiting request awaits the same promise.
 */
let refreshPromise: Promise<string> | null = null;

/** Set by AuthProvider so a failed refresh can clear app state, not just reload. */
let onAuthFailure: (() => void) | null = null;
export const setAuthFailureHandler = (fn: (() => void) | null): void => {
  onAuthFailure = fn;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as Retriable | undefined;
    const isAuthCall = original?.url?.includes('/auth/');

    // _retried guards against an infinite loop when /auth/refresh itself 401s.
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        refreshPromise ??= api
          .post<{ access_token: string }>('/auth/refresh')
          .then((r) => r.data.access_token)
          .finally(() => {
            refreshPromise = null;
          });

        setAccessToken(await refreshPromise);
        return api(original);
      } catch {
        setAccessToken(null);
        onAuthFailure?.();
      }
    }
    return Promise.reject(ApiError.from(error));
  },
);
