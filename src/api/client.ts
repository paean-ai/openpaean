/**
 * Paean API Client
 * HTTP client for communicating with the Paean AI backend
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { getToken, getApiUrl, clearAuth } from '../utils/config.js';

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
 */
export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: getApiUrl(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Paean-CLI/0.1.0',
    },
  });

  // Add auth token to requests
  client.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle response errors
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
      // Handle 401 Unauthorized - clear auth and prompt re-login
      if (error.response?.status === 401) {
        clearAuth();
      }

      // Extract error message
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'An unknown error occurred';

      // Create a more informative error
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
      'User-Agent': 'Paean-CLI/0.1.0',
    },
  });

  // Handle response errors
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'An unknown error occurred';

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

// Singleton instances
let apiClient: AxiosInstance | null = null;
let publicApiClient: AxiosInstance | null = null;

/**
 * Get the authenticated API client singleton
 */
export function getApiClient(): AxiosInstance {
  if (!apiClient) {
    apiClient = createApiClient();
  }
  return apiClient;
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
