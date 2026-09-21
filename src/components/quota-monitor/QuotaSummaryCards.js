"use client";

import { useMemo } from "react";
import Card from "@/shared/components/Card";

function formatSeconds(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return "-";
  if (totalSeconds === 0) return "Ready";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export default function QuotaSummaryCards({
  summary = {},
  loading = false,
  onRefresh,
}) {
  const {
    totalAccounts = 0,
    activeAccounts = 0,
    exhaustedAccounts = 0,
    warningAccounts = 0,
    healthyAccounts = 0,
    secondsToEarliestReset = null,
  } = summary;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Total Accounts */}
      <div className="rounded-xl border border-black/10 bg-surface p-3.5 shadow-sm dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">Total Accounts</span>
          <span className="material-symbols-outlined text-[18px] text-text-muted opacity-70">
            account_circle
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-text-main">
            {loading ? "..." : totalAccounts}
          </span>
          <span className="text-[11px] text-text-muted">
            ({activeAccounts} active)
          </span>
        </div>
      </div>

      {/* Healthy Accounts */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 shadow-sm dark:border-emerald-500/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Healthy (&gt;30%)
          </span>
          <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400">
            check_circle
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
            {loading ? "..." : healthyAccounts}
          </span>
          <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
            accounts ready
          </span>
        </div>
      </div>

      {/* Warning Accounts */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5 shadow-sm dark:border-amber-500/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Warning (&le;30%)
          </span>
          <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">
            warning
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300">
            {loading ? "..." : warningAccounts}
          </span>
          <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80">
            low quota
          </span>
        </div>
      </div>

      {/* Exhausted Accounts & Next Reset */}
      <div
        className={`rounded-xl border p-3.5 shadow-sm transition-colors ${
          exhaustedAccounts > 0
            ? "border-rose-500/30 bg-rose-500/[0.05] dark:border-rose-500/40"
            : "border-black/10 bg-surface dark:border-white/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-medium ${
              exhaustedAccounts > 0
                ? "text-rose-700 dark:text-rose-400"
                : "text-text-muted"
            }`}
          >
            Exhausted (0-5%)
          </span>
          <span
            className={`material-symbols-outlined text-[18px] ${
              exhaustedAccounts > 0
                ? "text-rose-600 dark:text-rose-400 animate-pulse"
                : "text-text-muted opacity-70"
            }`}
          >
            battery_alert
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold tracking-tight ${
                exhaustedAccounts > 0
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-text-main"
              }`}
            >
              {loading ? "..." : exhaustedAccounts}
            </span>
          </div>
          {secondsToEarliestReset !== null && secondsToEarliestReset !== undefined && (
            <span
              className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-text-muted"
              title="Time until next quota reset"
            >
              Reset: {formatSeconds(secondsToEarliestReset)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
