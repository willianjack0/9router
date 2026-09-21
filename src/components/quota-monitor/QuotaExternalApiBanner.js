"use client";

import { useState } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function QuotaExternalApiBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://apia.fishlab.com.br";
  const endpointSummary = `${baseUrl}/api/ext/quota/summary`;
  const endpointAccounts = `${baseUrl}/api/ext/quota/accounts`;

  return (
    <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.03] p-3.5 dark:border-brand-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <span className="material-symbols-outlined text-[18px]">api</span>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-text-main">
              External API for Desktop & Chrome Extension
            </h4>
            <p className="text-[11px] text-text-muted">
              Connect external tools with Bearer token authentication & CORS support.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-7 items-center gap-1 rounded-lg border border-black/10 px-2 text-xs font-medium text-text-muted hover:bg-black/5 hover:text-text-main dark:border-white/10 dark:hover:bg-white/5"
        >
          <span>{isOpen ? "Hide API Details" : "Show API Details"}</span>
          <span className="material-symbols-outlined text-[14px]">
            {isOpen ? "expand_less" : "expand_more"}
          </span>
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2.5 border-t border-black/5 pt-3 dark:border-white/5 text-xs">
          <div>
            <span className="font-medium text-text-main">Endpoints:</span>
            <div className="mt-1 space-y-1">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-black/5 px-2.5 py-1.5 font-mono text-[11px] dark:bg-white/5">
                <span className="truncate">GET {endpointSummary}</span>
                <button
                  type="button"
                  onClick={() => copy(endpointSummary, "summary")}
                  className="shrink-0 text-text-muted hover:text-brand-500"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copied === "summary" ? "check" : "content_copy"}
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-black/5 px-2.5 py-1.5 font-mono text-[11px] dark:bg-white/5">
                <span className="truncate">GET {endpointAccounts}</span>
                <button
                  type="button"
                  onClick={() => copy(endpointAccounts, "accounts")}
                  className="shrink-0 text-text-muted hover:text-brand-500"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copied === "accounts" ? "check" : "content_copy"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-text-muted">
            <span className="font-semibold text-text-main">Authentication Header:</span>{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono dark:bg-white/10">
              Authorization: Bearer &lt;NINEROUTER_KEY&gt;
            </code>{" "}
            or{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono dark:bg-white/10">
              X-API-Key: &lt;NINEROUTER_KEY&gt;
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
