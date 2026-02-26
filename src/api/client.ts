/**
 * OpenPaean API Client
 * HTTP client for communicating with the Paean AI backend
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getToken, getApiUrl, clearAuth, getRefreshToken, isTokenNearExpiry, storeAuth } from '../utils/config.js';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryableError(error: AxiosError): boolean {
  if (!error.response) return true;
  return RETRYABLE_STATUS_CODES.has(error.response.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let cliVersion: string | undefined;
try {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
  );
  cliVersion = packageJson.version;
} catch {
  cliVersion = 'unknown';
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Create an authenticated API client
 * @param options.clearAuthOn401 - Clear auth on 401 errors (default: true)
 */
export function createApiClient(options?: { clearAuthOn401?: boolean }): AxiosInstance {
  const clearAuthOn401 = options?.clearAuthOn401 !== false;

  const client = axios.create({
    baseURL: getApiUrl(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': `OpenPaean-CLI/${cliVersion}`,
    },
  });

  client.interceptors.request.use(async (config) => {
    if (isTokenNearExpiry()) {
      await refreshAuthToken();
    }
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiError>) => {
      if (error.response?.status === 401 && clearAuthOn401) {
        const refreshToken = getRefreshToken();
        if (refreshToken && error.config && !(error.config as unknown as Record<string, unknown>)._retried) {
          const refreshed = await refreshAuthToken();
          if (refreshed) {
            const config = error.config;
            (config as unknown as Record<string, unknown>)._retried = true;
            const token = getToken();
            if (token) {
              config.headers.Authorization = `Bearer ${token}`;
            }
            return client.request(config);
          }
        }
        clearAuth();
      }

      if (error.config && isRetryableError(error)) {
        const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number };
        config._retryCount = (config._retryCount || 0) + 1;
        if (config._retryCount <= MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, config._retryCount - 1);
          await sleep(delay);
          return client.request(config);
        }
      }

      const rawError = error.response?.data?.error;
      let errorMessage: string;
      if (typeof rawError === 'string') {
        errorMessage = rawError;
      } else if (rawError && typeof rawError === 'object' && typeof (rawError as Record<string, unknown>).message === 'string') {
        errorMessage = (rawError as Record<string, unknown>).message as string;
      } else {
        errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred';
      }

      const enhancedError = new Error(errorMessage) as Error & {
        statusCode?: number;
        isApiError: boolean;
      };
      enhancedError.statusCode = error.response?.status;
      enhancedError.isApiError = true;

      return Promise.reject(enhancedError);
    }
  );

  return client;
}

/**
 * Create an unauthenticated API client (for login flows)
 */
export function createPublicApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: getApiUrl(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': `OpenPaean-CLI/${cliVersion}`,
    },
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
      const rawError = error.response?.data?.error;
      let errorMessage: string;
      if (typeof rawError === 'string') {
        errorMessage = rawError;
      } else if (rawError && typeof rawError === 'object' && typeof (rawError as Record<string, unknown>).message === 'string') {
        errorMessage = (rawError as Record<string, unknown>).message as string;
      } else {
        errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred';
      }

      const enhancedError = new Error(errorMessage) as Error & {
        statusCode?: number;
        isApiError: boolean;
      };
      enhancedError.statusCode = error.response?.status;
      enhancedError.isApiError = true;

      return Promise.reject(enhancedError);
    }
  );

  return client;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAuthToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await axios.post(`${getApiUrl()}/auth/refresh-token`, {
        refreshToken,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `OpenPaean-CLI/${cliVersion}`,
        },
        timeout: 10000,
      });

      const data = response.data as {
        token?: string;
        refreshToken?: string;
        expiresAt?: string;
      };

      if (data.token) {
        storeAuth({
          token: data.token,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Singleton instances
let apiClient: AxiosInstance | null = null;
let publicApiClient: AxiosInstance | null = null;

/**
 * Get the authenticated API client singleton
 */
export function getApiClient(options?: { clearAuthOn401?: boolean }): AxiosInstance {
  if (!apiClient) {
    apiClient = createApiClient(options);
  }
  return apiClient;
}

/**
 * Create a non-clearing API client (doesn't invalidate auth on transient 401s).
 * Used by worker and gateway operations.
 */
export function createNonClearingApiClient(): AxiosInstance {
  return createApiClient({ clearAuthOn401: false });
}

/**
 * Get the public API client singleton
 */
export function getPublicApiClient(): AxiosInstance {
  if (!publicApiClient) {
    publicApiClient = createPublicApiClient();
  }
  return publicApiClient;
}

/**
 * Reset the API clients (useful after login/logout)
 */
export function resetApiClients(): void {
  apiClient = null;
  publicApiClient = null;
}
