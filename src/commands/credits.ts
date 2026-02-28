/**
 * Credits Command
 * View credits balance and manage USDC deposits
 */

import { Command } from 'commander';
import { isAuthenticated } from '../utils/config.js';
import {
  getCreditsStatus,
  getDepositInfo,
  pollDeposits,
  getDepositHistory,
  getDepositStatus,
  type DepositRecord,
} from '../api/credits.js';
import * as output from '../utils/output.js';

function requireAuth(): void {
  if (!isAuthenticated()) {
    output.error('Not logged in. Run `openpaean login` first.');
    process.exit(1);
  }
}

export const creditsCommand = new Command('credits')
  .description('View credits balance and manage USDC deposits')
  .option('--json', 'Output in JSON format')
  .action(async (options: { json?: boolean }) => {
    requireAuth();

    const spin = output.spinner('Fetching credits status...').start();

    try {
      const response = await getCreditsStatus();
      spin.stop();

      if (options.json) {
        output.json(response.data);
        return;
      }

      const d = response.data;

      output.header('Credits Status');
      output.tableRow('Balance', `${d.credits} / ${d.totalCredits} credits`);
      output.tableRow('Tier', d.subscriptionTier);

      if (d.canRecover) {
        output.tableRow('Recovery', output.colors.success('Available now'));
      } else if (d.nextRecoveryAt) {
        output.tableRow('Next Recovery', output.formatDate(d.nextRecoveryAt));
      }

      output.tableRow('Recovery Interval', `${d.recoveryIntervalHours}h`);

      if (d.billingPeriod) {
        output.tableRow('Billing Period', d.billingPeriod);
      }
      if (d.subscriptionEndDate) {
        output.tableRow('Subscription Ends', output.formatDate(d.subscriptionEndDate));
      }
      if (d.paymentSource) {
        output.tableRow('Payment Source', d.paymentSource);
      }

      output.newline();

      if (d.credits < 20) {
        output.warning(
          `Credits are low (${d.credits}). Use \`openpaean credits deposit-info\` to see USDC top-up addresses.`
        );
      }
    } catch (err: unknown) {
      spin.stop();
      output.error((err as Error).message || 'Failed to fetch credits status');
    }
  });

// ── deposit-info ─────────────────────────────────────────────────────────

creditsCommand
  .command('deposit-info')
  .description('Show unique USDC deposit addresses per chain')
  .option('--json', 'Output in JSON format')
  .action(async (options: { json?: boolean }) => {
    requireAuth();

    const spin = output.spinner('Fetching deposit info...').start();

    try {
      const info = await getDepositInfo();
      spin.stop();

      if (options.json) {
        output.json(info);
        return;
      }

      output.header('USDC Deposit Addresses');
      output.tableRow('Conversion Rate', info.conversionRate);
      output.tableRow('Minimum Deposit', `${info.minimumDeposit} USDC`);
      output.tableRow('Test Minimum', `${info.testMinimumDeposit} USDC`);
      output.newline();

      for (const [network, net] of Object.entries(info.networks)) {
        output.info(`${net.name} (${network})`);
        output.tableRow('Deposit Address', net.depositAddress, 22);
        if (net.usdcContract) {
          output.tableRow('USDC Contract', net.usdcContract, 22);
        }
        if (net.usdcMint) {
          output.tableRow('USDC Mint', net.usdcMint, 22);
        }
        output.tableRow('Confirmations', String(net.requiredConfirmations), 22);
        output.newline();
      }

      output.dim(
        'Send USDC to the address above. Deposits are detected automatically.'
      );
    } catch (err: unknown) {
      spin.stop();
      output.error((err as Error).message || 'Failed to fetch deposit info');
    }
  });

// ── deposit-poll ─────────────────────────────────────────────────────────

creditsCommand
  .command('deposit-poll')
  .description('Trigger blockchain scan and show pending/confirmed deposits')
  .option('--json', 'Output in JSON format')
  .action(async (options: { json?: boolean }) => {
    requireAuth();

    const spin = output.spinner('Scanning blockchain for deposits...').start();

    try {
      const result = await pollDeposits();
      spin.stop();

      if (options.json) {
        output.json(result);
        return;
      }

      output.header('Deposit Scan Results');
      output.tableRow('Current Credits', String(result.credits));
      output.newline();

      if (result.deposits.length === 0) {
        output.dim('No deposits found.');
        return;
      }

      for (const dep of result.deposits) {
        printDeposit(dep);
      }
    } catch (err: unknown) {
      spin.stop();
      output.error((err as Error).message || 'Failed to poll deposits');
    }
  });

// ── deposit-history ──────────────────────────────────────────────────────

creditsCommand
  .command('deposit-history')
  .description('Show confirmed deposit history')
  .option('--json', 'Output in JSON format')
  .action(async (options: { json?: boolean }) => {
    requireAuth();

    const spin = output.spinner('Fetching deposit history...').start();

    try {
      const result = await getDepositHistory();
      spin.stop();

      if (options.json) {
        output.json(result);
        return;
      }

      output.header('Deposit History');

      const deposits = result.deposits;
      if (!deposits || deposits.length === 0) {
        output.dim('No confirmed deposits yet.');
        return;
      }

      for (const dep of deposits) {
        printDeposit(dep);
      }
    } catch (err: unknown) {
      spin.stop();
      output.error((err as Error).message || 'Failed to fetch deposit history');
    }
  });

// ── deposit-status ───────────────────────────────────────────────────────

creditsCommand
  .command('deposit-status <txHash>')
  .description('Check the status of a specific deposit transaction')
  .option('--json', 'Output in JSON format')
  .action(async (txHash: string, options: { json?: boolean }) => {
    requireAuth();

    const spin = output.spinner('Checking transaction status...').start();

    try {
      const result = await getDepositStatus(txHash);
      spin.stop();

      if (options.json) {
        output.json(result);
        return;
      }

      if (!result.found) {
        output.warning('Transaction not found. It may not have been detected yet.');
        output.dim('Try `openpaean credits deposit-poll` to trigger a scan.');
        return;
      }

      output.header('Deposit Status');
      output.tableRow('Network', result.network || '—');
      output.tableRow('Tx Hash', result.txHash || txHash);
      output.tableRow('Amount', `${result.usdcAmount} USDC`);
      output.tableRow('Status', formatDepositStatus(result.status));
      output.tableRow('Confirmations', `${result.confirmations} / ${result.requiredConfirmations}`);
      output.tableRow('Credits Awarded', String(result.creditsAwarded || 0));
      if (result.confirmedAt) {
        output.tableRow('Confirmed At', output.formatDate(result.confirmedAt));
      }
      if (result.explorerUrl) {
        output.tableRow('Explorer', result.explorerUrl);
      }
    } catch (err: unknown) {
      spin.stop();
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        output.warning('Transaction not found.');
        output.dim('Try `openpaean credits deposit-poll` to trigger a scan.');
      } else {
        output.error(e.message || 'Failed to check deposit status');
      }
    }
  });

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDepositStatus(status: string): string {
  switch (status) {
    case 'confirmed':
      return output.colors.success('confirmed');
    case 'pending':
      return output.colors.warning('pending');
    case 'failed':
      return output.colors.error('failed');
    default:
      return status;
  }
}

function printDeposit(dep: DepositRecord): void {
  const statusStr = formatDepositStatus(dep.status);
  const amount = `${dep.usdcAmount} USDC`;
  const credits = dep.creditsAwarded > 0 ? ` → ${dep.creditsAwarded} credits` : '';

  output.listItem(
    `${output.colors.bold(amount)}${credits}  ${statusStr}  ${output.colors.dim(dep.network)}`
  );
  output.dim(`    tx: ${output.truncate(dep.txHash, 50)}`);
  if (dep.status === 'pending') {
    output.dim(
      `    confirmations: ${dep.confirmations} / ${dep.requiredConfirmations}`
    );
  }
  if (dep.explorerUrl) {
    output.dim(`    ${dep.explorerUrl}`);
  }
}
