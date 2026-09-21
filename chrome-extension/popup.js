// 9router Quota Monitor - Popup Logic with Quota Bucketing & Glassmorphism

document.addEventListener("DOMContentLoaded", async () => {
  const connStatus = document.getElementById("connStatus");
  const refreshBtn = document.getElementById("refreshBtn");
  const optionsBtn = document.getElementById("optionsBtn");
  const kpiTotal = document.getElementById("kpiTotal");
  const kpiHealthy = document.getElementById("kpiHealthy");
  const kpiWarning = document.getElementById("kpiWarning");
  const kpiExhausted = document.getElementById("kpiExhausted");
  const resetAlertBar = document.getElementById("resetAlertBar");
  const resetAlertText = document.getElementById("resetAlertText");
  const itemsCount = document.getElementById("itemsCount");
  const contentList = document.getElementById("contentList");
  const lastUpdated = document.getElementById("lastUpdated");
  const openDashboardBtn = document.getElementById("openDashboardBtn");
  const tabByQuota = document.getElementById("tabByQuota");
  const tabByAccount = document.getElementById("tabByAccount");

  let currentMode = "quota"; // "quota" | "account"
  let cachedSummary = null;
  let cachedAccounts = [];
  let cachedBuckets = [];

  // 1. Load initial cached data
  const stored = await chrome.storage.local.get([
    "baseUrl",
    "summary",
    "accounts",
    "quotaBuckets",
    "viewMode",
    "lastError",
    "lastFetchedAt",
  ]);

  if (stored.viewMode) {
    currentMode = stored.viewMode;
  }
  updateTabButtons();

  const baseUrl = stored.baseUrl || "https://apia.fishlab.com.br";
  openDashboardBtn.href = `${baseUrl}/dashboard/quota`;
  openDashboardBtn.target = "_blank";

  if (stored.summary || stored.accounts) {
    cachedSummary = stored.summary;
    cachedAccounts = stored.accounts || [];
    cachedBuckets = stored.quotaBuckets || deriveBuckets(cachedAccounts);
    renderUI();
  }

  // 2. Fetch fresh data
  fetchFreshData();

  // 3. Tab Event Listeners
  tabByQuota.addEventListener("click", () => {
    currentMode = "quota";
    chrome.storage.local.set({ viewMode: currentMode });
    updateTabButtons();
    renderContent();
  });

  tabByAccount.addEventListener("click", () => {
    currentMode = "account";
    chrome.storage.local.set({ viewMode: currentMode });
    updateTabButtons();
    renderContent();
  });

  refreshBtn.addEventListener("click", () => {
    fetchFreshData(true);
  });

  optionsBtn.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });

  function updateTabButtons() {
    tabByQuota.classList.toggle("active", currentMode === "quota");
    tabByAccount.classList.toggle("active", currentMode === "account");
  }

  async function fetchFreshData(force = false) {
    refreshBtn.classList.add("spinning");
    connStatus.textContent = "Syncing...";
    connStatus.style.color = "var(--primary)";

    chrome.runtime.sendMessage({ action: "refresh", force }, (response) => {
      refreshBtn.classList.remove("spinning");

      chrome.storage.local.get(
        ["summary", "accounts", "quotaBuckets", "lastError", "lastFetchedAt"],
        (fresh) => {
          cachedSummary = fresh.summary;
          cachedAccounts = fresh.accounts || [];
          cachedBuckets = fresh.quotaBuckets || fresh.summary?.quotaBuckets || deriveBuckets(cachedAccounts);
          renderUI(fresh.lastError, fresh.lastFetchedAt);
        }
      );
    });
  }

  function deriveBuckets(accounts = []) {
    const bucketMap = new Map();

    for (const acc of accounts) {
      if (acc.isActive === false) continue;
      for (const q of acc.quotas || []) {
        const key = q.name || "General";
        if (!bucketMap.has(key)) {
          bucketMap.set(key, {
            name: q.name,
            modelKey: q.modelKey,
            totalAccounts: 0,
            availableAccounts: 0,
            exhaustedAccounts: 0,
            earliestResetAt: null,
            secondsToEarliestReset: null,
            accounts: [],
          });
        }

        const b = bucketMap.get(key);
        b.totalAccounts++;
        const pct = q.remainingPercentage ?? 0;
        if (pct > 5) b.availableAccounts++;
        else b.exhaustedAccounts++;

        if (q.resetAt) {
          const qTime = new Date(q.resetAt).getTime();
          if (!b.earliestResetAt || qTime < new Date(b.earliestResetAt).getTime()) {
            b.earliestResetAt = q.resetAt;
            b.secondsToEarliestReset = q.secondsToReset;
          }
        }

        b.accounts.push({
          accountId: acc.id,
          accountName: acc.name,
          provider: acc.provider,
          remainingPercentage: pct,
          secondsToReset: q.secondsToReset,
        });
      }
    }

    return Array.from(bucketMap.values()).map((b) => {
      b.status =
        b.availableAccounts === 0
          ? "exhausted"
          : b.availableAccounts < b.totalAccounts
          ? "partial"
          : "healthy";
      b.accounts.sort((x, y) => y.remainingPercentage - x.remainingPercentage);
      return b;
    });
  }

  function renderUI(lastError = null, lastFetchedAt = null) {
    if (lastError) {
      connStatus.textContent = "Offline / Error";
      connStatus.style.color = "var(--rose)";
    } else {
      connStatus.textContent = "Connected";
      connStatus.style.color = "var(--emerald)";
    }

    if (lastFetchedAt) {
      const timeStr = new Date(lastFetchedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      lastUpdated.textContent = `Updated: ${timeStr}`;
    }

    // Update KPI metrics based on Quota Buckets
    const totalBuckets = cachedBuckets.length;
    let healthyBuckets = 0;
    let partialBuckets = 0;
    let exhaustedBuckets = 0;

    for (const b of cachedBuckets) {
      if (b.status === "healthy") healthyBuckets++;
      else if (b.status === "partial") partialBuckets++;
      else if (b.status === "exhausted") exhaustedBuckets++;
    }

    kpiTotal.textContent = totalBuckets;
    kpiHealthy.textContent = healthyBuckets;
    kpiWarning.textContent = partialBuckets;
    kpiExhausted.textContent = exhaustedBuckets;

    // Reset Alert Bar
    if (cachedSummary?.secondsToEarliestReset !== null && cachedSummary?.secondsToEarliestReset !== undefined) {
      resetAlertBar.style.display = "flex";
      resetAlertText.textContent = `Earliest quota reset in ${formatSeconds(cachedSummary.secondsToEarliestReset)}`;
    } else {
      resetAlertBar.style.display = "none";
    }

    renderContent();
  }

  function renderContent() {
    if (currentMode === "quota") {
      renderQuotaBuckets();
    } else {
      renderAccountsList();
    }
  }

  function renderQuotaBuckets() {
    itemsCount.textContent = `${cachedBuckets.length} quotas`;

    if (!cachedBuckets || cachedBuckets.length === 0) {
      contentList.innerHTML = `
        <div class="empty-state">
          <p>No active quota types found.</p>
        </div>
      `;
      return;
    }

    contentList.innerHTML = cachedBuckets
      .map((bucket) => {
        const badgeClass = `badge-${bucket.status}`;
        const accountsHtml = (bucket.accounts || [])
          .map((acc) => {
            const pct = acc.remainingPercentage ?? 0;
            const colorClass = pct > 30 ? "high" : pct > 5 ? "mid" : "low";

            return `
              <div class="sub-account-row">
                <div class="sub-account-info">
                  <span class="sub-account-name" title="${escapeHtml(acc.accountName)}">
                    ${escapeHtml(acc.accountName)}
                  </span>
                  <div class="sub-account-metrics">
                    <span class="pct-text pct-${colorClass}">${pct}%</span>
                  </div>
                </div>
                <div class="progress-track">
                  <div class="progress-fill progress-${colorClass}" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          })
          .join("");

        const resetLine =
          bucket.secondsToEarliestReset !== null && bucket.secondsToEarliestReset !== undefined
            ? `<div class="card-reset-line">
                 <span>Accounts ready: ${bucket.availableAccounts}/${bucket.totalAccounts}</span>
                 <span>Reset: ${formatSeconds(bucket.secondsToEarliestReset)}</span>
               </div>`
            : `<div class="card-reset-line">
                 <span>Accounts ready: ${bucket.availableAccounts}/${bucket.totalAccounts}</span>
               </div>`;

        return `
          <div class="glass-card ${bucket.status}">
            <div class="card-header">
              <div class="quota-title-area">
                <span class="quota-name">${escapeHtml(bucket.name)}</span>
                <span class="accounts-pill">${bucket.totalAccounts} acc</span>
              </div>
              <span class="status-badge-mini ${badgeClass}">${bucket.status}</span>
            </div>
            <div class="bucket-accounts">
              ${accountsHtml}
            </div>
            ${resetLine}
          </div>
        `;
      })
      .join("");
  }

  function renderAccountsList() {
    itemsCount.textContent = `${cachedAccounts.length} accounts`;

    if (!cachedAccounts || cachedAccounts.length === 0) {
      contentList.innerHTML = `
        <div class="empty-state">
          <p>No connected accounts found.</p>
        </div>
      `;
      return;
    }

    contentList.innerHTML = cachedAccounts
      .map((acc) => {
        const quotasHtml = (acc.quotas || [])
          .map((q) => {
            const pct = q.remainingPercentage ?? 0;
            const colorClass = pct > 30 ? "high" : pct > 5 ? "mid" : "low";
            return `
              <div class="sub-account-row">
                <div class="sub-account-info">
                  <span class="sub-account-name">${escapeHtml(q.name)}</span>
                  <span class="pct-text pct-${colorClass}">${pct}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill progress-${colorClass}" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          })
          .join("");

        const resetHtml =
          acc.secondsToReset !== null && acc.secondsToReset !== undefined
            ? `<div class="card-reset-line">
                 <span>Status: ${acc.status}</span>
                 <span>Reset: ${formatSeconds(acc.secondsToReset)}</span>
               </div>`
            : `<div class="card-reset-line"><span>Status: ${acc.status}</span></div>`;

        return `
          <div class="glass-card ${acc.status || ""}">
            <div class="card-header">
              <div class="quota-title-area">
                <span class="quota-name">${escapeHtml(acc.name)}</span>
                <span class="accounts-pill">${escapeHtml(acc.provider || "")}</span>
              </div>
              <span class="status-badge-mini badge-${acc.status || "healthy"}">${acc.status || "Active"}</span>
            </div>
            <div class="bucket-accounts">
              ${quotasHtml}
            </div>
            ${resetHtml}
          </div>
        `;
      })
      .join("");
  }

  function formatSeconds(sec) {
    if (sec === null || sec === undefined || sec < 0) return "-";
    if (sec === 0) return "Ready";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
