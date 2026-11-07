// Firebase Firestore Quota & Usage Tracker Service
// تتبع استهلاك حصص فايربيس السحابية (المطالعات، الكتابة، الحذف) ومزامنتها مع استجابات Google Cloud الحية

import { isFirestoreQuotaExceeded, markQuotaExceeded } from './firebaseFirestoreSyncService';
import { db, doc, getDocFromServer } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.example.json';

export interface FirebaseQuotaStats {
  readsLimit: number;
  writesLimit: number;
  deletesLimit: number;
  readsUsed: number;
  writesUsed: number;
  deletesUsed: number;
  readsPercent: number;
  writesPercent: number;
  deletesPercent: number;
  lastResetDate: string;
  nextResetTimestamp: number;
  formattedCountdown: string;
  isQuotaExceeded: boolean;
  quotaErrorMessage?: string | null;
  projectId: string;
  databaseId: string;
  consoleUrl: string;
}

const STORAGE_KEY_QUOTA = 'lobnan_accounting_firebase_quota_v1';
const STORAGE_KEY_BLOCKED = 'lobnan_accounting_firebase_quota_blocked_v1';

const DAILY_READS_LIMIT = 50000;
const DAILY_WRITES_LIMIT = 20000;
const DAILY_DELETES_LIMIT = 20000;

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = (firebaseConfig as typeof firebaseConfig & { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';
export const FIREBASE_CONSOLE_URL = `https://console.firebase.google.com/project/${encodeURIComponent(FIREBASE_PROJECT_ID)}/firestore/databases/${encodeURIComponent(FIREBASE_DATABASE_ID)}/data`;

// Quotas reset at midnight America/Los_Angeles, including daylight-saving transitions.
function getQuotaPeriodKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = (key: string) => parts.find(part => part.type === key)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function getNextResetTimestamp(): number {
  const now = Date.now();
  const today = getQuotaPeriodKey(new Date(now));
  let low = now;
  let high = now + 30 * 60 * 60 * 1000;
  // Binary search first instant of next Pacific calendar day.
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (getQuotaPeriodKey(new Date(mid)) === today) low = mid;
    else high = mid;
  }
  return high;
}

export function formatCountdown(targetTimestamp: number): string {
  const diff = Math.max(0, targetTimestamp - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

interface StoredQuota {
  periodKey: string;
  reads: number;
  writes: number;
  deletes: number;
}

function getStoredQuota(): StoredQuota {
  const currentKey = getQuotaPeriodKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUOTA);
    if (raw) {
      const parsed: StoredQuota = JSON.parse(raw);
      if (parsed.periodKey === currentKey) {
        return parsed;
      }
    }
  } catch {}

  return {
    periodKey: currentKey,
    reads: 0,
    writes: 0,
    deletes: 0
  };
}

function saveStoredQuota(data: StoredQuota) {
  try {
    localStorage.setItem(STORAGE_KEY_QUOTA, JSON.stringify(data));
  } catch {}
}

export const GOOGLE_CLOUD_METRICS_URL = `https://console.cloud.google.com/firestore/usage?project=${FIREBASE_PROJECT_ID}`;

export const firebaseQuotaTracker = {
  trackRead: (count: number = 1) => {
    if (count <= 0) return;
    const quota = getStoredQuota();
    quota.reads += count;
    saveStoredQuota(quota);
  },

  trackWrite: (count: number = 1) => {
    if (count <= 0) return;
    const quota = getStoredQuota();
    quota.writes += count;
    saveStoredQuota(quota);
  },

  trackDelete: (count: number = 1) => {
    if (count <= 0) return;
    const quota = getStoredQuota();
    quota.deletes += count;
    saveStoredQuota(quota);
  },

  setBlockedByServer: (errorMessage?: string) => {
    try {
      localStorage.setItem(STORAGE_KEY_BLOCKED, JSON.stringify({
        blockedAt: Date.now(),
        periodKey: getQuotaPeriodKey(),
        message: errorMessage || 'You have gone over your daily usage limits'
      }));
    } catch {}
    markQuotaExceeded();
  },

  checkIsBlockedByServer: (): boolean => {
    if (isFirestoreQuotaExceeded()) return true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BLOCKED);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.periodKey === getQuotaPeriodKey()) {
          return true;
        } else {
          localStorage.removeItem(STORAGE_KEY_BLOCKED);
        }
      }
    } catch {}
    return false;
  },

  // Perform a live test against Google Cloud Firestore to check if quota is currently blocked & measure latency
  verifyLiveQuotaStatus: async (): Promise<{ isBlocked: boolean; message: string; latencyMs?: number }> => {
    const startTime = Date.now();
    try {
      const testDoc = doc(db, 'lobnan_sync_workspaces', 'lobnan_main', 'meta', 'invoiceNumberingReady');
      await getDocFromServer(testDoc);
      const latencyMs = Date.now() - startTime;
      firebaseQuotaTracker.trackRead(1);
      // If read succeeded, server is not quota blocked
      try { localStorage.removeItem(STORAGE_KEY_BLOCKED); } catch {}
      return { 
        isBlocked: false, 
        message: `الاتصال بالسيرفر السحابي يعمل بشكل ممتاز 🟢 (زمن الاستجابة: ${latencyMs}ms)`,
        latencyMs 
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const msg = err?.message || '';
      const isQuotaErr = err?.code === 'resource-exhausted' || msg.includes('Quota limit exceeded') || msg.includes('gone over your daily usage limits') || msg.includes('Quota exceeded');
      if (isQuotaErr) {
        firebaseQuotaTracker.setBlockedByServer('You have gone over your daily usage limits');
        return { isBlocked: true, message: 'You have gone over your daily usage limits', latencyMs };
      }
      return { isBlocked: firebaseQuotaTracker.checkIsBlockedByServer(), message: msg, latencyMs };
    }
  },

  getStats: (): FirebaseQuotaStats => {
    const quota = getStoredQuota();
    const nextReset = getNextResetTimestamp();
    const countdown = formatCountdown(nextReset);
    const isBlocked = firebaseQuotaTracker.checkIsBlockedByServer();

    let readsUsed = quota.reads;
    let writesUsed = quota.writes;
    let deletesUsed = quota.deletes;

    let readsPercent = Math.min(100, Math.round((readsUsed / DAILY_READS_LIMIT) * 100));
    let writesPercent = Math.min(100, Math.round((writesUsed / DAILY_WRITES_LIMIT) * 100));
    let deletesPercent = Math.min(100, Math.round((deletesUsed / DAILY_DELETES_LIMIT) * 100));

    // If Google Cloud server has returned Quota Exceeded, reflect 100% blocked status truthfully
    if (isBlocked) {
      readsUsed = Math.max(readsUsed, DAILY_READS_LIMIT);
      writesUsed = Math.max(writesUsed, DAILY_WRITES_LIMIT);
      readsPercent = 100;
      writesPercent = 100;
    }

    return {
      readsLimit: DAILY_READS_LIMIT,
      writesLimit: DAILY_WRITES_LIMIT,
      deletesLimit: DAILY_DELETES_LIMIT,
      readsUsed,
      writesUsed,
      deletesUsed,
      readsPercent,
      writesPercent,
      deletesPercent,
      lastResetDate: quota.periodKey,
      nextResetTimestamp: nextReset,
      formattedCountdown: countdown,
      isQuotaExceeded: isBlocked || readsPercent >= 100 || writesPercent >= 100,
      quotaErrorMessage: isBlocked ? 'You have gone over your daily usage limits' : null,
      projectId: FIREBASE_PROJECT_ID,
      databaseId: FIREBASE_DATABASE_ID,
      consoleUrl: FIREBASE_CONSOLE_URL
    };
  },

  resetCurrentTracker: () => {
    const currentKey = getQuotaPeriodKey();
    const fresh: StoredQuota = {
      periodKey: currentKey,
      reads: 0,
      writes: 0,
      deletes: 0
    };
    saveStoredQuota(fresh);
    try { localStorage.removeItem(STORAGE_KEY_BLOCKED); } catch {}
  }
};
