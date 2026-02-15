/**
 * Logout Command
 * Clear stored authentication credentials
 */

import { Command } from 'commander';
import { logout } from '../api/auth.js';
import { isAuthenticated, getConfigValue } from '../utils/config.js';
import * as output from '../utils/output.js';

export const logoutCommand = new Command('logout')
  .description('Sign out of OpenPaean')
  .option('--force', 'Force logout without confirmation')
  .action(async (options) => {
    if (!isAuthenticated()) {
      output.info('Not currently logged in.');
      return;
    }

    const email = getConfigValue('email');

    if (!options.force) {
      output.warning(`You are about to sign out${email ? ` from ${email}` : ''}.`);
      output.dim('This will clear your stored credentials.');
      output.newline();
    }

    logout();
    output.success('Successfully logged out.');
    output.dim('Use "openpaean login" to sign in again.');
  });
