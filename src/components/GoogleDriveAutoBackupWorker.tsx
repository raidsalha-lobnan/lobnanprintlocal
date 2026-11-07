import React, { useEffect, useRef } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  getCachedDriveToken,
  setCachedDriveToken,
  executeHourlyDriveBackupFlow
} from '../services/googleDriveBackupService';

const STORAGE_KEY_AUTO_BACKUP = 'lobnan_drive_auto_backup_enabled';
const STORAGE_KEY_RETENTION = 'lobnan_drive_retention_confirmed';
const STORAGE_KEY_LAST_TIME = 'lobnan_drive_last_backup_time';
const STORAGE_KEY_LAST_INFO = 'lobnan_drive_last_backup_info';
const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes

export const GoogleDriveAutoBackupWorker: React.FC = () => {
  const accounting = useAccounting();
  const accountingRef = useRef(accounting);
  const isRunningRef = useRef(false);

  useEffect(() => {
    accountingRef.current = accounting;
  }, [accounting]);

  useEffect(() => {
    const checkAndRunHourlyBackup = async () => {
      if (isRunningRef.current) return;

      const autoEnabled = true; // MANDATORY BY DEFAULT
      if (!autoEnabled) return;

      const token = getCachedDriveToken();
      if (!token) {
        // Not connected or token not yet in memory
        return;
      }

      const lastTimeStr = localStorage.getItem(STORAGE_KEY_LAST_TIME);
      const lastTime = lastTimeStr ? parseInt(lastTimeStr, 10) : 0;
      const now = Date.now();

      // Check if 30 minutes have elapsed since last backup
      if (now - lastTime < THIRTY_MINUTES_MS) {
        return;
      }

      try {
        isRunningRef.current = true;
        const currentData = accountingRef.current;
        const retentionConfirmed = true; // MANDATORY 7-DAY RETENTION ENFORCED

        // Prepare full backup snapshot
        const fullBackup = {
          version: '2.0',
          systemName: 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان',
          exportedAt: new Date().toISOString(),
          exportedBy: currentData.currentUser?.fullName || currentData.currentUser?.username || 'النسخ الاحتياطي التلقائي الدوري (كل ساعة)',
          settings: currentData.settings,
          companies: currentData.companies,
          branches: currentData.branches,
          warehouses: currentData.warehouses,
          warehouseOperations: currentData.warehouseOperations,
          users: currentData.users,
          roles: currentData.roles,
          accounts: currentData.accounts,
          journalEntries: currentData.journalEntries,
          inventory: currentData.inventory,
          stockMovements: currentData.stockMovements,
          parties: currentData.parties,
          employees: currentData.employees,
          employeeAdvances: currentData.employeeAdvances,
          employeeDeductions: currentData.employeeDeductions,
          employeeIncentives: currentData.employeeIncentives,
          payrollSheets: currentData.payrollSheets,
          printOrders: currentData.printOrders,
          invoices: currentData.invoices,
          purchases: currentData.purchases,
          purchaseReturns: currentData.purchaseReturns,
          salesReturns: currentData.salesReturns,
          vouchers: currentData.vouchers,
          treasuries: currentData.treasuries,
          debtClearings: currentData.debtClearings,
          expenses: currentData.expenses,
          dailyEntrySheets: currentData.dailyEntrySheets || {}
        };

        const result = await executeHourlyDriveBackupFlow(token, fullBackup, {
          retentionDays: 7,
          autoCleanOld: false
        });

        if (result.success) {
          localStorage.setItem(STORAGE_KEY_LAST_TIME, now.toString());
          localStorage.setItem(STORAGE_KEY_LAST_INFO, JSON.stringify(result));
          console.log('✓ Google Drive hourly backup succeeded:', result.fileName, `(Deleted ${result.deletedOldBackupsCount} backups older than 7 days)`);
        } else {
          if (result.error?.includes('401') || result.error?.includes('انتهت صلاحية')) {
            setCachedDriveToken(null);
          }
          console.warn('Google Drive hourly backup failed:', result.error);
        }
      } catch (err: any) {
        if (err?.message?.includes('401')) {
          setCachedDriveToken(null);
        }
        console.warn('Hourly backup worker error:', err?.message || err);
      } finally {
        isRunningRef.current = false;
      }
    };

    // Check once upon mount (after 10 seconds to allow app and auth to settle)
    const initialTimeout = setTimeout(checkAndRunHourlyBackup, 10000);

    // Check every 1 minute
    const interval = setInterval(checkAndRunHourlyBackup, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  return null;
};
