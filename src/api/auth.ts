/**
 * Authentication API
 * Handles QR code login and browser OAuth flows
 */

import { createServer, type Server } from 'http';
import { URL } from 'url';
import open from 'open';
import qrcode from 'qrcode-terminal';
import { getPublicApiClient, getApiClient, resetApiClients } from './client.js';
import { storeAuth, clearAuth, getWebUrl } from '../utils/config.js';
import * as output from '../utils/output.js';

export interface QrSessionResponse {
  success: boolean;
  sessionId: string;
  expiresAt: string;
  expiresInSeconds: number;
  qrContent: string;
}

export interface QrStatusResponse {
  success: boolean;
  status: 'pending' | 'scanned' | 'confirmed' | 'expired' | 'used';
  token?: string;
  userId?: number;
  isExpired?: boolean;
  expiresAt?: string;
}

export interface LoginResponse {
  user: {
    id: number;
    email: string;
    username?: string;
    displayName?: string;
  };
  token: string;
}

export interface UserInfo {
  id: number;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Create a QR login session
 */
export async function createQrSession(deviceType = 'CLI'): Promise<QrSessionResponse> {
  const client = getPublicApiClient();
  const response = await client.post<QrSessionResponse>('/auth/qr/create-session', {
    deviceType,
    deviceId: `cli-${Date.now()}`,
  });
  return response.data;
}

/**
 * Check QR session status
 */
export async function getQrSessionStatus(sessionId: string): Promise<QrStatusResponse> {
  const client = getPublicApiClient();
  const response = await client.get<QrStatusResponse>(`/auth/qr/status/${sessionId}`);
  return response.data;
}

/**
 * Perform QR code login
 * Displays QR code in terminal and polls for confirmation
 */
export async function qrLogin(
  onStatus?: (status: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create QR session
    const session = await createQrSession();

    // Display QR code in terminal
    output.newline();
    output.info('Scan this QR code with the Paean mobile app to log in:');
    output.newline();

    qrcode.generate(session.qrContent, { small: true });

    output.newline();
    output.dim(`Session expires in ${Math.floor(session.expiresInSeconds / 60)} minutes`);
    output.newline();

    // Poll for status
    const maxPollTime = session.expiresInSeconds * 1000;
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
      const status = await getQrSessionStatus(session.sessionId);

      if (onStatus) {
        onStatus(status.status);
      }

      switch (status.status) {
        case 'scanned':
          output.info('QR code scanned! Waiting for confirmation...');
          break;

        case 'confirmed':
          if (status.token && status.userId) {
            // Store authentication
            storeAuth({
              token: status.token,
              userId: status.userId,
            });
            resetApiClients();

            // Try to fetch user info
            try {
              const userInfo = await getCurrentUser();
              if (userInfo) {
                storeAuth({
                  token: status.token,
                  userId: status.userId,
                  email: userInfo.email,
                });
              }
            } catch {
              // Ignore - we still have the token
            }

            return { success: true };
          }
          return { success: false, error: 'No token received' };

        case 'expired':
          return { success: false, error: 'QR code expired. Please try again.' };

        case 'used':
          return { success: false, error: 'This QR code has already been used.' };

        case 'pending':
        default:
          // Continue polling
          break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return { success: false, error: 'Login timed out. Please try again.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Perform browser-based OAuth login
 * Opens browser and starts local server to receive callback
 */
export async function browserLogin(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Find an available port
    const port = 9876 + Math.floor(Math.random() * 100);
    const callbackUrl = `http://127.0.0.1:${port}/callback`;

    let server: Server | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    // Create local server to receive callback
    server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const error = url.searchParams.get('error');
        const userId = url.searchParams.get('userId');
        const email = url.searchParams.get('email');

        // Send response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (token) {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <title>Login Successful</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; }
                  .icon { font-size: 64px; margin-bottom: 16px; }
                  h1 { color: #22c55e; margin-bottom: 8px; }
                  p { color: #a3a3a3; }
                </style>
              </head>
              <body>
                <div class="icon">&#x2705;</div>
                <h1>Login Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

          // Store authentication
          storeAuth({
            token,
            userId: userId ? parseInt(userId, 10) : undefined,
            email: email || undefined,
          });
          resetApiClients();

          cleanup();
          resolve({ success: true });
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <title>Login Failed</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; }
                  .icon { font-size: 64px; margin-bottom: 16px; }
                  h1 { color: #ef4444; margin-bottom: 8px; }
                  p { color: #a3a3a3; }
                </style>
              </head>
              <body>
                <div class="icon">&#x274C;</div>
                <h1>Login Failed</h1>
                <p>${error || 'An error occurred during login.'}</p>
                <p>Please return to the terminal and try again.</p>
              </body>
            </html>
          `);

          cleanup();
          resolve({ success: false, error: error || 'Login failed' });
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err) => {
      cleanup();
      resolve({ success: false, error: `Server error: ${err.message}` });
    });

    server.listen(port, '127.0.0.1', async () => {
      // Open browser to login page
      const webUrl = getWebUrl();
      const loginUrl = `${webUrl}/auth/cli?callback=${encodeURIComponent(callbackUrl)}`;

      output.info('Opening browser for login...');
      output.dim(`If browser doesn't open, visit: ${loginUrl}`);
      output.newline();

      try {
        await open(loginUrl);
      } catch {
        output.warning('Could not open browser automatically.');
        output.info(`Please open this URL manually: ${loginUrl}`);
      }

      output.info('Waiting for login...');

      // Set timeout (5 minutes)
      timeoutId = setTimeout(() => {
        cleanup();
        resolve({ success: false, error: 'Login timed out. Please try again.' });
      }, 5 * 60 * 1000);
    });
  });
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    const client = getApiClient();
    const response = await client.get<{ user: UserInfo } | UserInfo>('/user/profile');

    // Handle both response formats
    const data = response.data;
    if ('user' in data) {
      return data.user;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Validate current token
 */
export async function validateToken(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    return user !== null;
  } catch {
    return false;
  }
}

/**
 * Logout - clear stored credentials
 */
export function logout(): void {
  clearAuth();
  resetApiClients();
}
