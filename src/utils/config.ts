/**
 * Configuration management for OpenPaean CLI
 * Stores authentication tokens and user preferences in ~/.openpaean/config.json
 */

import Conf from "conf";
import { homedir } from "os";
import { join } from "path";

export interface OpenPaeanConfig {
  // Authentication
  token?: string;
  refreshToken?: string;
  userId?: number;
  email?: string;
  expiresAt?: string;

  // API Configuration
  apiUrl?: string;
  webUrl?: string;

  // User Preferences
  defaultPriority?: "high" | "medium" | "low";
  outputFormat?: "table" | "json" | "minimal";
}

// Support environment variable overrides for API URLs
const CONFIG_DEFAULTS: OpenPaeanConfig = {
  apiUrl: process.env.OPENPAEAN_API_URL || "https://api.paean.ai",
  webUrl: process.env.OPENPAEAN_WEB_URL || "https://app.paean.ai",
  defaultPriority: "medium",
  outputFormat: "table",
};

// Store config in ~/.openpaean directory
const config = new Conf<OpenPaeanConfig>({
  projectName: "openpaean",
  cwd: join(homedir(), ".openpaean"),
  defaults: CONFIG_DEFAULTS,
  schema: {
    token: { type: "string" },
    refreshToken: { type: "string" },
    userId: { type: "number" },
    email: { type: "string" },
    expiresAt: { type: "string" },
    apiUrl: { type: "string" },
    webUrl: { type: "string" },
    defaultPriority: { type: "string", enum: ["high", "medium", "low"] },
    outputFormat: { type: "string", enum: ["table", "json", "minimal"] },
  },
});

/**
 * Get the full configuration
 */
export function getConfig(): OpenPaeanConfig {
  return config.store;
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof OpenPaeanConfig>(
  key: K
): OpenPaeanConfig[K] {
  return config.get(key);
}

/**
 * Set a specific config value
 */
export function setConfigValue<K extends keyof OpenPaeanConfig>(
  key: K,
  value: OpenPaeanConfig[K]
): void {
  config.set(key, value);
}

/**
 * Set multiple config values at once
 */
export function setConfig(values: Partial<OpenPaeanConfig>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      config.set(key as keyof OpenPaeanConfig, value);
    }
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const token = config.get("token");
  const expiresAt = config.get("expiresAt");

  if (!token) return false;

  // Check if token is expired (with 5 minute buffer)
  if (expiresAt) {
    const expiry = new Date(expiresAt).getTime();
    const now = Date.now();
    const buffer = 5 * 60 * 1000; // 5 minutes
    if (expiry - buffer < now) {
      return false;
    }
  }

  return true;
}

/**
 * Get the authentication token
 */
export function getToken(): string | undefined {
  return config.get("token");
}

/**
 * Get the API URL (supports environment variable override)
 */
export function getApiUrl(): string {
  return process.env.OPENPAEAN_API_URL || config.get("apiUrl") || CONFIG_DEFAULTS.apiUrl!;
}

/**
 * Get the Web URL (supports environment variable override)
 */
export function getWebUrl(): string {
  return process.env.OPENPAEAN_WEB_URL || config.get("webUrl") || CONFIG_DEFAULTS.webUrl!;
}

/**
 * Store authentication data
 */
export function storeAuth(data: {
  token: string;
  userId?: number;
  email?: string;
  expiresAt?: string;
}): void {
  setConfig({
    token: data.token,
    userId: data.userId,
    email: data.email,
    expiresAt: data.expiresAt,
  });
}

/**
 * Clear authentication data (logout)
 */
export function clearAuth(): void {
  config.delete("token");
  config.delete("refreshToken");
  config.delete("userId");
  config.delete("email");
  config.delete("expiresAt");
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return config.path;
}

/**
 * Reset config to defaults
 */
export function resetConfig(): void {
  config.clear();
}

// Re-export types with both names for compatibility
export type PaeanConfig = OpenPaeanConfig;
