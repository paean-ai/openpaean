/**
 * Login Command
 * Authenticate with Paean AI using QR code or browser OAuth
 */

import { Command } from 'commander';
import { qrLogin, browserLogin, getCurrentUser, validateToken } from '../api/auth.js';
import { isAuthenticated, getConfigValue } from '../utils/config.js';
import * as output from '../utils/output.js';

export const loginCommand = new Command('login')
  .description('Authenticate with Paean AI')
  .option('--qr', 'Use QR code login (scan with mobile app)')
  .option('--browser', 'Use browser-based login')
  .option('--check', 'Check current authentication status')
  .action(async (options) => {
    // Check current status
    if (options.check) {
      await checkAuthStatus();
      return;
    }

    // If already logged in, show status
    if (isAuthenticated()) {
      const email = getConfigValue('email');
      output.success(`Already logged in${email ? ` as ${email}` : ''}`);
      output.dim('Use "paean logout" to sign out, or "paean login --check" to verify.');
      return;
    }

    // Determine login method
    const useQr = options.qr;
    const useBrowser = options.browser;

    // Default to browser if neither specified
    const method = useQr ? 'qr' : useBrowser ? 'browser' : 'browser';

    output.header('Paean AI Login');

    const spin = output.spinner(
      method === 'qr' ? 'Creating QR session...' : 'Preparing login...'
    ).start();

    try {
      let result: { success: boolean; error?: string };

      if (method === 'qr') {
        spin.stop();
        result = await qrLogin((status) => {
          if (status === 'scanned') {
            output.info('QR code scanned! Confirming...');
          }
        });
      } else {
        spin.stop();
        result = await browserLogin();
      }

      if (result.success) {
        output.newline();
        output.success('Login successful!');

        // Show user info
        const user = await getCurrentUser();
        if (user) {
          output.tableRow('Email', user.email);
          if (user.name) {
            output.tableRow('Name', user.name);
          }
        }

        output.newline();
        output.dim('You can now use "paean tasks" to view your tasks.');
        process.exit(0);
      } else {
        output.newline();
        output.error(result.error || 'Login failed');
        process.exit(1);
      }
    } catch (error) {
      spin.stop();
      const message = error instanceof Error ? error.message : 'Unknown error';
      output.error(`Login failed: ${message}`);
      process.exit(1);
    }
  });

async function checkAuthStatus(): Promise<void> {
  output.header('Authentication Status');

  if (!isAuthenticated()) {
    output.warning('Not logged in');
    output.dim('Use "paean login" to authenticate.');
    return;
  }

  const spin = output.spinner('Validating token...').start();

  try {
    const isValid = await validateToken();
    spin.stop();

    if (isValid) {
      const user = await getCurrentUser();
      output.success('Authenticated');

      if (user) {
        output.tableRow('Email', user.email);
        if (user.name) {
          output.tableRow('Name', user.name);
        }
        output.tableRow('User ID', String(user.id));
      }
    } else {
      output.warning('Token expired or invalid');
      output.dim('Use "paean login" to re-authenticate.');
    }
  } catch (error) {
    spin.stop();
    output.warning('Could not validate token');
    output.dim('Use "paean login" to re-authenticate.');
  }
}
