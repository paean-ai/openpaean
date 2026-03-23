import fs from 'fs';
import { join } from 'path';
import { getConfigDir } from '../utils/config.js';
import type { AccountData } from './api.js';

export interface WechatContact {
    userId: string;
    contextToken: string;
    lastSeen: string;
    displayName?: string;
}

function wechatDir(): string { return join(getConfigDir(), 'wechat'); }
function credFile(): string { return join(wechatDir(), 'account.json'); }
function syncFile(): string { return join(wechatDir(), 'sync_buf.txt'); }
function contactsFile(): string { return join(wechatDir(), 'contacts.json'); }

export function loadCredentials(): AccountData | null {
    try {
        if (!fs.existsSync(credFile())) return null;
        return JSON.parse(fs.readFileSync(credFile(), 'utf-8'));
    } catch { return null; }
}

export function saveCredentials(data: AccountData): void {
    fs.mkdirSync(wechatDir(), { recursive: true });
    fs.writeFileSync(credFile(), JSON.stringify(data, null, 2), 'utf-8');
    try { fs.chmodSync(credFile(), 0o600); } catch { /* best-effort */ }
}

export function removeCredentials(): void {
    try { if (fs.existsSync(credFile())) fs.unlinkSync(credFile()); } catch { /* ignore */ }
    try { if (fs.existsSync(syncFile())) fs.unlinkSync(syncFile()); } catch { /* ignore */ }
}

export function loadSyncBuf(): string {
    try { if (fs.existsSync(syncFile())) return fs.readFileSync(syncFile(), 'utf-8'); } catch { /* ignore */ }
    return '';
}

export function saveSyncBuf(buf: string): void {
    try { fs.mkdirSync(wechatDir(), { recursive: true }); fs.writeFileSync(syncFile(), buf, 'utf-8'); } catch { /* ignore */ }
}

export function loadContacts(): WechatContact[] {
    try {
        if (!fs.existsSync(contactsFile())) return [];
        return JSON.parse(fs.readFileSync(contactsFile(), 'utf-8'));
    } catch { return []; }
}

export function saveContact(userId: string, contextToken: string): void {
    const contacts = loadContacts();
    const displayName = userId.split('@')[0] || userId;
    const idx = contacts.findIndex(c => c.userId === userId);
    const entry: WechatContact = { userId, contextToken, lastSeen: new Date().toISOString(), displayName };
    if (idx >= 0) contacts[idx] = entry; else contacts.push(entry);
    try {
        fs.mkdirSync(wechatDir(), { recursive: true });
        fs.writeFileSync(contactsFile(), JSON.stringify(contacts, null, 2), 'utf-8');
    } catch { /* ignore */ }
}

export function getContactToken(userId: string): string | null {
    const contacts = loadContacts();
    const match = contacts.find(c => c.userId === userId || c.displayName === userId);
    return match?.contextToken ?? null;
}
