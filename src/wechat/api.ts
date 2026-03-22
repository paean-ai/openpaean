import crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const BOT_TYPE = '3';
const CHANNEL_VERSION = '0.1.0';
const LONG_POLL_TIMEOUT_MS = 35_000;
const QR_POLL_TIMEOUT_MS = 35_000;
const SEND_TIMEOUT_MS = 15_000;

export const MSG_TYPE_USER = 1;
const MSG_TYPE_BOT = 2;
const MSG_STATE_FINISH = 2;
const MSG_ITEM_TEXT = 1;
const MSG_ITEM_VOICE = 3;

export { DEFAULT_BASE_URL };

export interface AccountData {
    token: string;
    baseUrl: string;
    accountId: string;
    userId?: string;
    savedAt: string;
}

export interface QRCodeResponse { qrcode: string; qrcode_img_content: string; }
export interface QRStatusResponse {
    status: 'wait' | 'scaned' | 'confirmed' | 'expired';
    bot_token?: string; ilink_bot_id?: string; baseurl?: string; ilink_user_id?: string;
}

interface MessageItem {
    type?: number;
    text_item?: { text?: string };
    voice_item?: { text?: string };
    ref_msg?: { title?: string };
}

export interface WeixinMessage {
    from_user_id?: string;
    message_type?: number;
    item_list?: MessageItem[];
    context_token?: string;
}

export interface GetUpdatesResp {
    ret?: number; errcode?: number; errmsg?: string;
    msgs?: WeixinMessage[]; get_updates_buf?: string;
}

function randomUin(): string {
    return Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0)), 'utf-8').toString('base64');
}

function headers(token?: string, body?: string): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        'X-WECHAT-UIN': randomUin(),
    };
    if (body) h['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'));
    if (token?.trim()) h.Authorization = `Bearer ${token.trim()}`;
    return h;
}

function norm(u: string): string { return u.endsWith('/') ? u : `${u}/`; }

async function apiFetch(baseUrl: string, endpoint: string, body: string, token?: string, timeoutMs = 15_000): Promise<string> {
    const url = new URL(endpoint, norm(baseUrl)).toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'POST', headers: headers(token, body), body, signal: ctrl.signal });
        clearTimeout(timer);
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
        return text;
    } catch (err) { clearTimeout(timer); throw err; }
}

export async function fetchQRCode(baseUrl: string = DEFAULT_BASE_URL): Promise<QRCodeResponse> {
    const res = await fetch(new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`, norm(baseUrl)).toString());
    if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
    return (await res.json()) as QRCodeResponse;
}

export async function pollQRStatus(baseUrl: string, qrcode: string): Promise<QRStatusResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), QR_POLL_TIMEOUT_MS);
    try {
        const res = await fetch(new URL(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, norm(baseUrl)).toString(),
            { headers: { 'iLink-App-ClientVersion': '1' }, signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`QR status failed: ${res.status}`);
        return (await res.json()) as QRStatusResponse;
    } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') return { status: 'wait' };
        throw err;
    }
}

export async function getUpdates(baseUrl: string, token: string, buf: string): Promise<GetUpdatesResp> {
    try {
        const raw = await apiFetch(baseUrl, 'ilink/bot/getupdates', JSON.stringify({
            get_updates_buf: buf, base_info: { channel_version: CHANNEL_VERSION },
        }), token, LONG_POLL_TIMEOUT_MS);
        return JSON.parse(raw) as GetUpdatesResp;
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return { ret: 0, msgs: [], get_updates_buf: buf };
        throw err;
    }
}

export async function sendTextMessage(baseUrl: string, token: string, to: string, text: string, contextToken: string): Promise<void> {
    await apiFetch(baseUrl, 'ilink/bot/sendmessage', JSON.stringify({
        msg: {
            from_user_id: '', to_user_id: to,
            client_id: `openpaean:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            message_type: MSG_TYPE_BOT, message_state: MSG_STATE_FINISH,
            item_list: [{ type: MSG_ITEM_TEXT, text_item: { text } }],
            context_token: contextToken,
        },
        base_info: { channel_version: CHANNEL_VERSION },
    }), token, SEND_TIMEOUT_MS);
}

export function extractText(msg: WeixinMessage): string {
    if (!msg.item_list?.length) return '';
    for (const item of msg.item_list) {
        if (item.type === MSG_ITEM_TEXT && item.text_item?.text) {
            const t = item.text_item.text;
            if (item.ref_msg?.title) return `[Quote: ${item.ref_msg.title}]\n${t}`;
            return t;
        }
        if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) return item.voice_item.text;
    }
    return '';
}
