/**
 * WeChat Command
 * CLI commands for WeChat channel integration.
 *
 * Workflow:
 *   1. openpaean wechat setup    — Scan QR code to authenticate
 *   2. openpaean wechat start    — Start agent with WeChat channel active
 *   3. openpaean wechat status   — Check login status
 *   4. openpaean wechat logout   — Remove saved credentials
 */

import { Command } from 'commander';
import chalk from 'chalk';

export const wechatCommand = new Command('wechat')
    .description('WeChat channel — bridge WeChat messages to local agent')
    .addHelpText('after', `
Workflow:
  $ openpaean wechat setup     Authenticate with WeChat (scan QR code)
  $ openpaean wechat start     Start the agent with WeChat channel active
  $ openpaean wechat status    Show current login status
  $ openpaean wechat logout    Remove saved credentials

The "start" command launches the interactive agent with WeChat message
bridging enabled. You can also use the --wechat flag directly:
  $ openpaean --wechat
`);

wechatCommand
    .command('setup')
    .description('Authenticate with WeChat via QR code')
    .option('-f, --force', 'Re-authenticate even if already logged in')
    .addHelpText('after', `
After setup completes, start the agent with:
  $ openpaean wechat start
  $ openpaean --wechat         (equivalent shorthand)
`)
    .action(async (opts) => {
        const { fetchQRCode, pollQRStatus, DEFAULT_BASE_URL } = await import('../wechat/api.js');
        const { loadCredentials, saveCredentials } = await import('../wechat/credentials.js');

        const existing = loadCredentials();
        if (existing && !opts.force) {
            console.log(`Existing WeChat account: ${existing.accountId}`);
            console.log(`Saved at: ${existing.savedAt}\n`);
            const readline = await import('node:readline');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise<string>(resolve => rl.question('Re-authenticate? (y/N) ', resolve));
            rl.close();
            if (answer.toLowerCase() !== 'y') { console.log('Keeping existing credentials.'); return; }
        }

        console.log('Fetching WeChat login QR code...\n');
        const qrResp = await fetchQRCode(DEFAULT_BASE_URL);
        try {
            const qrterm = await import('qrcode-terminal');
            await new Promise<void>(resolve => {
                qrterm.default.generate(qrResp.qrcode_img_content, { small: true }, (qr: string) => { console.log(qr); resolve(); });
            });
        } catch { console.log(`QR URL: ${qrResp.qrcode_img_content}\n`); }

        console.log('Scan the QR code with WeChat...\n');
        const deadline = Date.now() + 480_000;
        let scanned = false;
        while (Date.now() < deadline) {
            const status = await pollQRStatus(DEFAULT_BASE_URL, qrResp.qrcode);
            switch (status.status) {
                case 'wait': process.stdout.write('.'); break;
                case 'scaned': if (!scanned) { console.log('\nScanned! Confirm on phone...'); scanned = true; } break;
                case 'expired': console.error('\nQR code expired. Run setup again.'); process.exit(1); break;
                case 'confirmed': {
                    if (!status.ilink_bot_id || !status.bot_token) { console.error('\nLogin failed.'); process.exit(1); }
                    const account = {
                        token: status.bot_token, baseUrl: status.baseurl || DEFAULT_BASE_URL,
                        accountId: status.ilink_bot_id, userId: status.ilink_user_id,
                        savedAt: new Date().toISOString(),
                    };
                    saveCredentials(account);
                    console.log(chalk.green(`\n✓ WeChat connected!`));
                    console.log(`  Account: ${account.accountId}\n`);
                    console.log(chalk.bold('Next step — start the agent with WeChat channel:'));
                    console.log(`  ${chalk.cyan('openpaean wechat start')}`);
                    console.log(`  ${chalk.cyan('openpaean --wechat')}         ${chalk.dim('(equivalent)')}`);
                    return;
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        console.error('\nLogin timed out.');
        process.exit(1);
    });

wechatCommand
    .command('start')
    .description('Start the agent with WeChat channel active')
    .option('--no-mcp', 'Disable local MCP server integration')
    .option('-d, --debug', 'Enable debug logging')
    .action(async (opts) => {
        const { loadCredentials } = await import('../wechat/credentials.js');
        if (!loadCredentials()) {
            console.log(chalk.yellow('WeChat not set up yet.\n'));
            console.log(`Run ${chalk.cyan('openpaean wechat setup')} to authenticate first.`);
            process.exit(1);
        }
        const { isAuthenticated } = await import('../utils/config.js');
        if (!isAuthenticated()) {
            console.log(chalk.yellow('⚠️  Not logged in. Run `openpaean login` first.\n'));
            process.exit(1);
        }
        const { runAgentMode } = await import('./agent.js');
        await runAgentMode({
            mcp: opts.mcp !== false,
            debug: opts.debug ?? false,
            wechatEnabled: true,
        });
    });

wechatCommand
    .command('status')
    .description('Show WeChat login status')
    .action(async () => {
        const { loadCredentials } = await import('../wechat/credentials.js');
        const account = loadCredentials();
        if (account) {
            console.log(chalk.green('✓ WeChat: Logged in'));
            console.log(`  Account: ${account.accountId}`);
            console.log(`  User:    ${account.userId ?? 'N/A'}`);
            console.log(`  Saved:   ${account.savedAt}\n`);
            console.log(`Start the agent with: ${chalk.cyan('openpaean wechat start')}`);
        } else {
            console.log(chalk.gray('✗ WeChat: Not logged in'));
            console.log(`  Run ${chalk.cyan('openpaean wechat setup')} to authenticate.`);
        }
    });

wechatCommand
    .command('logout')
    .description('Remove WeChat credentials')
    .action(async () => {
        const { removeCredentials, loadCredentials } = await import('../wechat/credentials.js');
        if (!loadCredentials()) { console.log('No WeChat credentials found.'); return; }
        removeCredentials();
        console.log(chalk.green('✓ WeChat credentials removed.'));
    });
