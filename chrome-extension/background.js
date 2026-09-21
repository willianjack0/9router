// 9router Quota Monitor - Background Service Worker

const DEFAULT_SETTINGS = {
  baseUrl: "https://apia.fishlab.com.br",
  apiKey: "sk-ecec8cc806d4fcd4-g9k4oo-e054de89",
  refreshInterval: 30, // seconds
  enableNotifications: true,
  badgeMode: "status", // "status" | "exhausted_count" | "lowest_percent"
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const settings = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(settings);

  setupAlarm(settings.refreshInterval);
  fetchQuotaData();
});

// Setup alarm for periodic sync
function setupAlarm(intervalSeconds) {
  chrome.alarms.clear("quota_sync");
  if (intervalSeconds > 0) {
    chrome.alarms.create("quota_sync", {
      periodInMinutes: Math.max(0.5, intervalSeconds / 60),
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "quota_sync") {
    fetchQuotaData();
  }
});

// Fetch quota data from 9router API
async function fetchQuotaData(force = false) {
  try {
    const config = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const { baseUrl, apiKey, enableNotifications, badgeMode } = config;

    if (!baseUrl) {
      updateBadge("OFF", "#6b7280");
      return null;
    }

    const cleanBase = baseUrl.replace(/\/+$/, "");
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const [summaryRes, accountsRes] = await Promise.all([
      fetch(`${cleanBase}/api/ext/quota/summary${force ? "?force=1" : ""}`, { headers }),
      fetch(`${cleanBase}/api/ext/quota/accounts${force ? "?force=1" : ""}`, { headers }),
    ]);

    if (!summaryRes.ok) {
      updateBadge("ERR", "#ef4444");
      await chrome.storage.local.set({
        lastError: `HTTP ${summaryRes.status}: ${summaryRes.statusText}`,
        lastFetchedAt: Date.now(),
      });
      return;
    }

    const summary = await summaryRes.json();
    const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] };

    // Previous accounts to check for state changes (notifications)
    const prevData = await chrome.storage.local.get(["accountsSummary"]);
    const prevExhausted = prevData?.accountsSummary?.exhaustedAccounts ?? 0;

    await chrome.storage.local.set({
      summary,
      accounts: accountsData.accounts || [],
      lastError: null,
      lastFetchedAt: Date.now(),
    });

    // Update Extension Badge
    updateBadgeFromSummary(summary, accountsData.accounts, badgeMode);

    // Desktop notification if quota newly exhausted
    if (
      enableNotifications &&
      summary.exhaustedAccounts > 0 &&
      summary.exhaustedAccounts > prevExhausted
    ) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "9router Quota Alert",
        message: `${summary.exhaustedAccounts} account(s) are currently exhausted. Next reset in ${formatCountdown(summary.secondsToEarliestReset)}.`,
        priority: 2,
      });
    }

    return { summary, accounts: accountsData.accounts };
  } catch (error) {
    console.error("[Background] Fetch error:", error);
    updateBadge("ERR", "#ef4444");
    await chrome.storage.local.set({
      lastError: error.message || "Network error",
      lastFetchedAt: Date.now(),
    });
  }
}

function updateBadgeFromSummary(summary, accounts = [], mode = "status") {
  if (!summary) {
    updateBadge("", "#000000");
    return;
  }

  const exhausted = summary.exhaustedAccounts || 0;
  const warning = summary.warningAccounts || 0;

  if (mode === "exhausted_count") {
    if (exhausted > 0) {
      updateBadge(String(exhausted), "#ef4444");
    } else {
      updateBadge("0", "#10b981");
    }
    return;
  }

  if (exhausted > 0) {
    updateBadge("CRIT", "#ef4444");
  } else if (warning > 0) {
    updateBadge("WARN", "#f59e0b");
  } else {
    updateBadge("OK", "#10b981");
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

function formatCountdown(totalSec) {
  if (!totalSec || totalSec <= 0) return "Ready";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Handle messages from Popup or Options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refresh") {
    fetchQuotaData(true).then((data) => sendResponse({ success: true, data }));
    return true; // Keep channel open for async response
  }

  if (request.action === "update_settings") {
    setupAlarm(request.settings.refreshInterval);
    fetchQuotaData(true).then((data) => sendResponse({ success: true, data }));
    return true;
  }
});
