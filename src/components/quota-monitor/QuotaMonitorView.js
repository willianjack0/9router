"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ProviderLimits from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits";
import QuotaSummaryCards from "./QuotaSummaryCards";
import QuotaExternalApiBanner from "./QuotaExternalApiBanner";

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
];

export default function QuotaMonitorView() {
  const [summary, setSummary] = useState({
    totalAccounts: 0,
    activeAccounts: 0,
    exhaustedAccounts: 0,
    warningAccounts: 0,
    healthyAccounts: 0,
    secondsToEarliestReset: null,
  });
  const [loading, setLoading] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(30);
  const [countdown, setCountdown] = useState(30);

  const fetchSummary = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ext/quota/summary${force ? "?force=1" : ""}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.warn("[QuotaMonitorView] Failed to fetch summary:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydrate user preference from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("ninerouter_quota_refresh_sec");
    if (stored !== null) {
      const parsed = Number(stored);
      if (REFRESH_OPTIONS.some((opt) => opt.value === parsed)) {
        setRefreshIntervalSec(parsed);
        setCountdown(parsed);
      }
    }
  }, []);

  // Handle countdown and interval
  useEffect(() => {
    fetchSummary();

    if (refreshIntervalSec <= 0) return;

    setCountdown(refreshIntervalSec);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchSummary();
          return refreshIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refreshIntervalSec, fetchSummary]);

  const handleIntervalChange = (newSec) => {
    setRefreshIntervalSec(newSec);
    setCountdown(newSec);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ninerouter_quota_refresh_sec", String(newSec));
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls & Refresh Selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-main">Quota Usage & Rate Limits</h2>
          <p className="text-xs text-text-muted">
            Real-time tracking of provider accounts, reset countdowns, and token consumption.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh interval selector */}
          <div className="flex items-center rounded-lg border border-black/10 bg-black/[0.02] p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
            <span className="px-2 text-[11px] font-medium text-text-muted">Auto-refresh:</span>
            {REFRESH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleIntervalChange(opt.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  refreshIntervalSec === opt.value
                    ? "bg-brand-500 text-white shadow-xs"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Countdown & Manual Refresh */}
          <button
            type="button"
            onClick={() => {
              setCountdown(refreshIntervalSec > 0 ? refreshIntervalSec : 0);
              fetchSummary(true);
            }}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-black/10 px-2.5 text-xs font-medium text-text-main hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 disabled:opacity-50"
            title="Refresh quota status now"
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                loading ? "animate-spin" : ""
              }`}
            >
              refresh
            </span>
            {refreshIntervalSec > 0 && (
              <span className="text-[11px] font-mono text-text-muted tabular-nums">
                ({countdown}s)
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <QuotaSummaryCards summary={summary} loading={loading} />

      {/* External API Integration Banner */}
      <QuotaExternalApiBanner />

      {/* Main Provider Limits Component */}
      <div className="pt-2">
        <ProviderLimits />
      </div>
    </div>
  );
}
