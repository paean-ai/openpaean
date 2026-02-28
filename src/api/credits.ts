/**
 * Credits & Crypto Deposit API
 * Communicates with zero-api for credits status and USDC deposit management
 */

import { getApiClient } from './client.js';

// ── Credits ──────────────────────────────────────────────────────────────

export interface CreditsStatus {
  credits: number;
  totalCredits: number;
  subscriptionTier: string;
  nextRecoveryAt: string | null;
  canRecover: boolean;
  recoveryIntervalHours: number;
  billingPeriod: string | null;
  subscriptionEndDate: string | null;
  paymentSource: string | null;
}

export async function getCreditsStatus(): Promise<{ success: boolean; data: CreditsStatus }> {
  const client = getApiClient();
  const { data } = await client.get('/credits/status');
  return data;
}

// ── Crypto Deposit ───────────────────────────────────────────────────────

export interface NetworkDepositInfo {
  name: string;
  depositAddress: string;
  explorerTxUrl: string;
  explorerAddrUrl?: string;
  requiredConfirmations: number;
  usdcContract?: string;
  chainId?: number;
  usdcMint?: string;
}

export interface DepositInfo {
  networks: Record<string, NetworkDepositInfo>;
  conversionRate: string;
  conversionRateNumeric: number;
  minimumDeposit: number;
  testMinimumDeposit: number;
}

export async function getDepositInfo(): Promise<DepositInfo> {
  const client = getApiClient();
  const { data } = await client.get('/crypto-deposit/info');
  return data;
}

export interface DepositRecord {
  id: number;
  network: string;
  txHash: string;
  usdcAmount: number;
  creditsAwarded: number;
  status: string;
  confirmations: number;
  requiredConfirmations: number;
  fromAddress: string;
  blockNumber: number;
  confirmedAt: string | null;
  createdAt: string;
  explorerUrl: string | null;
}

export interface PollResult {
  deposits: DepositRecord[];
  credits: number;
}

export async function pollDeposits(): Promise<PollResult> {
  const client = getApiClient();
  const { data } = await client.get('/crypto-deposit/poll');
  return data;
}

export async function getDepositHistory(): Promise<{ deposits: DepositRecord[] }> {
  const client = getApiClient();
  const { data } = await client.get('/crypto-deposit/history');
  return data;
}

export interface DepositStatusResult {
  found: boolean;
  status: string;
  id?: number;
  network?: string;
  txHash?: string;
  usdcAmount?: number;
  creditsAwarded?: number;
  confirmations?: number;
  requiredConfirmations?: number;
  confirmedAt?: string | null;
  createdAt?: string;
  explorerUrl?: string;
}

export async function getDepositStatus(txHash: string): Promise<DepositStatusResult> {
  const client = getApiClient();
  const { data } = await client.get(`/crypto-deposit/status/${encodeURIComponent(txHash)}`);
  return data;
}
