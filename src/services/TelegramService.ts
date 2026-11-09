import { BusinessSettings } from '../types';
import {getLocalSyncConfig} from '../sync-next/httpTransport';
import {authHeaders,getCurrentSessionToken,secureLoginEnabled} from './secureAuth';

let pollingTimeout: any = null;
let isPollingActive = false;

const currentTabId = typeof window !== 'undefined'
  ? (window.name || (window.name = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`))
  : 'server';

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramSendMessageOptions {
  chatId?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: {
    inline_keyboard?: TelegramInlineButton[][];
    keyboard?: { text: string }[][];
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
  };
}

export interface TelegramIncomingAction {
  type: 'message' | 'callback';
  text: string;
  data?: string;
  chatId: string;
  callbackQueryId?: string;
  messageId?: number;
  fromName?: string;
  token: string;
}

export const TelegramService = {
  sendMessage: async (
    text: string,
    settings: BusinessSettings,
    options?: TelegramSendMessageOptions
  ): Promise<boolean> => {
    const token = settings.telegramConfig?.botToken;
    const targetChatId = options?.chatId || settings.telegramConfig?.defaultChatId;

    if (!settings.telegramConfig?.enabled || !token || !targetChatId) {
      return false;
    }

    try {
      const payload: any = {
        chat_id: targetChatId,
        text,
        parse_mode: options?.parseMode || 'HTML',
      };

      if (options?.replyMarkup) {
        payload.reply_markup = options.replyMarkup;
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return response.ok;
    } catch (error) {
      console.warn('Error sending Telegram message:', error);
      return false;
    }
  },

  answerCallbackQuery: async (callbackQueryId: string, token: string, text?: string): Promise<boolean> => {
    if (!callbackQueryId || !token) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text || '',
          show_alert: false,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  sendDocument: async (
    blob: Blob,
    filename: string,
    caption: string,
    chatId?: string,
    botToken?: string
  ): Promise<boolean> => {
    const targetChatId = chatId || '';
    const targetToken = botToken || '';
    if (!targetToken || !targetChatId) return false;

    try {
      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      formData.append('document', blob, filename);
      if (caption) formData.append('caption', caption);

      const response = await fetch(`https://api.telegram.org/bot${targetToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });
      return response.ok;
    } catch (error) {
      console.warn('Error sending document to Telegram:', error);
      return false;
    }
  },

  startPolling: (
    settings: BusinessSettings,
    onAction: (action: TelegramIncomingAction) => void | Promise<void>
  ) => {
    if (!settings.telegramConfig?.enabled || !settings.telegramConfig.botToken) {
      TelegramService.stopPolling();
      return;
    }
    TelegramService.stopPolling();
    isPollingActive = true;

    const scheduleNext = (delayMs: number) => {
      if (!isPollingActive) return;
      pollingTimeout = setTimeout(poll, delayMs);
    };
    const isTabLeader = (): boolean => {
      try {
        const raw = localStorage.getItem('telegram_polling_leader');
        if (!raw) return true;
        const parsed = JSON.parse(raw);
        return !parsed?.tabId || Date.now() - parsed.time > 15000 ||
          parsed.tabId === currentTabId;
      } catch {
        return true;
      }
    };
    const claimLeadership = () => {
      try {
        localStorage.setItem('telegram_polling_leader', JSON.stringify({
          tabId: currentTabId, time: Date.now()
        }));
      } catch {}
    };
    let inFlight = false;
    const poll = async () => {
      if (!isPollingActive || inFlight) return;
      if (!navigator.onLine || !isTabLeader()) {
        scheduleNext(10000);
        return;
      }
      inFlight = true;
      claimLeadership();
      try {
        const config = getLocalSyncConfig();
        const headers = {
          ...authHeaders(config.url, secureLoginEnabled() ? getCurrentSessionToken() : config.token),
          'Content-Type': 'application/json'
        };
        const claim = await fetch(
          config.url + '/api/v1/telegram/inbox/claim?workspace=' +
            encodeURIComponent(config.workspace),
          { method: 'POST', headers, body: '{}', cache: 'no-store' }
        );
        if (!claim.ok) {
          scheduleNext(claim.status === 401 ? 20000 : 10000);
          return;
        }
        const response = await claim.json() as {
          item?: {
            updateId: number;
            leaseToken: string;
            action: Omit<TelegramIncomingAction, 'token'>;
          } | null;
        };
        if (!response.item) {
          scheduleNext(3500);
          return;
        }
        const {updateId, leaseToken, action} = response.item;
        const token = settings.telegramConfig?.botToken || '';
        if (!token) {
          scheduleNext(15000);
          return;
        }
        if (action.type === 'callback' && action.callbackQueryId) {
          await TelegramService.answerCallbackQuery(action.callbackQueryId, token);
        }
        await onAction({...action, token});
        const ack = await fetch(
          config.url + '/api/v1/telegram/inbox/ack?workspace=' +
            encodeURIComponent(config.workspace),
          {method: 'POST', headers, body: JSON.stringify({updateId, leaseToken}), cache: 'no-store'}
        );
        if (!ack.ok) {
          console.warn('Telegram report completed but server acknowledgement needs retry');
        }
        scheduleNext(400);
      } catch (error) {
        console.warn('Telegram report queue temporarily unavailable', error);
        scheduleNext(15000);
      } finally {
        inFlight = false;
      }
    };
    scheduleNext(1200);
  },

  stopPolling: () => {
    isPollingActive = false;
    if (pollingTimeout) {
      clearTimeout(pollingTimeout);
      pollingTimeout = null;
    }
    try {
      const raw = localStorage.getItem('telegram_polling_leader');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.tabId === currentTabId) {
          localStorage.removeItem('telegram_polling_leader');
        }
      }
    } catch {}
  },
};
