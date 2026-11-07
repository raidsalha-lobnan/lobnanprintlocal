import { BusinessSettings } from '../types';

let lastUpdateId = 0;
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
    onAction: (action: TelegramIncomingAction) => void
  ) => {
    if (!settings.telegramConfig?.enabled || !settings.telegramConfig?.botToken) {
      TelegramService.stopPolling();
      return;
    }

    TelegramService.stopPolling();
    isPollingActive = true;
    const token = settings.telegramConfig.botToken;

    const scheduleNext = (delayMs: number) => {
      if (!isPollingActive) return;
      pollingTimeout = setTimeout(poll, delayMs);
    };

    const isTabLeader = (): boolean => {
      try {
        const raw = localStorage.getItem('telegram_polling_leader');
        if (!raw) return true;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.tabId || Date.now() - parsed.time > 15000) return true;
        return parsed.tabId === currentTabId;
      } catch {
        return true;
      }
    };

    const claimLeadership = () => {
      try {
        localStorage.setItem(
          'telegram_polling_leader',
          JSON.stringify({ tabId: currentTabId, time: Date.now() })
        );
      } catch {}
    };

    let isFetchInFlight = false;
    let consecutiveConflicts = 0;

    const poll = async () => {
      if (!isPollingActive || isFetchInFlight) return;
      if (!settings.telegramConfig?.enabled || !settings.telegramConfig?.botToken) {
        TelegramService.stopPolling();
        return;
      }
      if (!navigator.onLine) {
        scheduleNext(15000);
        return;
      }

      // Multi-tab coordination: only the leader tab polls Telegram getUpdates
      if (!isTabLeader()) {
        scheduleNext(10000);
        return;
      }
      claimLeadership();

      isFetchInFlight = true;
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=0`
        ).catch(() => null);

        if (!response) {
          scheduleNext(15000);
          return;
        }

        if (response.status === 409) {
          // Conflict: external webhook or another bot instance
          consecutiveConflicts++;
          if (consecutiveConflicts >= 4) {
            console.warn(
              'Notice: Telegram getUpdates polling paused due to external webhook/bot conflict (HTTP 409). Outgoing Telegram notifications remain active.'
            );
            TelegramService.stopPolling();
            return;
          }
          scheduleNext(60000);
          return;
        }
        consecutiveConflicts = 0;

        if (!response.ok) {
          scheduleNext(20000);
          return;
        }

        const data = await response.json().catch(() => null);

        if (data && data.ok && Array.isArray(data.result) && data.result.length > 0) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;

            // 1. Text message
            if (update.message && update.message.text) {
              const text = update.message.text;
              const chatId = update.message.chat.id.toString();
              const fromName = [
                update.message.from?.first_name,
                update.message.from?.last_name,
              ]
                .filter(Boolean)
                .join(' ');

              onAction({
                type: 'message',
                text,
                chatId,
                messageId: update.message.message_id,
                fromName,
                token,
              });
            }

            // 2. Callback query (inline keyboard button click)
            if (update.callback_query) {
              const cb = update.callback_query;
              const chatId = cb.message?.chat?.id?.toString() || cb.from?.id?.toString() || '';
              const data = cb.data || '';
              const fromName = [cb.from?.first_name, cb.from?.last_name]
                .filter(Boolean)
                .join(' ');

              // Acknowledge the callback immediately so telegram client removes loading icon
              TelegramService.answerCallbackQuery(cb.id, token);

              onAction({
                type: 'callback',
                text: data,
                data,
                chatId,
                callbackQueryId: cb.id,
                messageId: cb.message?.message_id,
                fromName,
                token,
              });
            }
          }
        }
        scheduleNext(3500);
      } catch {
        scheduleNext(20000);
      } finally {
        isFetchInFlight = false;
      }
    };

    scheduleNext(1500);
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
