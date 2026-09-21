// 9router Quota Monitor - Popup Logic

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
  const accountsCount = document.getElementById("accountsCount");
  const accountsList = document.getElementById("accountsList");
  const lastUpdated = document.getElementById("lastUpdated");
  const openDashboardBtn = document.getElementById("openDashboardBtn");

  let timerInterval = null;

  // 1. Load initial cached data
  const data = await chrome.storage.local.get([
    "baseUrl",
    "summary",
    "accounts",
    "lastError",
    "lastFetchedAt",
  ]);

  const baseUrl = data.baseUrl || "https://apia.fishlab.com.br";
  openDashboardBtn.href = `${baseUrl}/dashboard/quota`;
  openDashboardBtn.target = "_blank";

  if (data.summary || data.accounts) {
    renderUI(data.summary, data.accounts, data.lastError, data.lastFetchedAt);
  }

  // 2. Fetch fresh data from background worker
  fetchFreshData();

  // 3. Event Listeners
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

  async function fetchFreshData(force = false) {
    refreshBtn.classList.add("spinning");
    connStatus.textContent = "Syncing...";
    connStatus.style.color = "var(--primary)";

    chrome.runtime.sendMessage({ action: "refresh", force }, (response) => {
      refreshBtn.classList.remove("spinning");

      chrome.storage.local.get(
        ["summary", "accounts", "lastError", "lastFetchedAt"],
        (freshData) => {
          renderUI(
            freshData.summary,
            freshData.accounts,
            freshData.lastError,
            freshData.lastFetchedAt
          );
        }
      );
    });
  }

  function renderUI(summary, accounts = [], lastError = null, lastFetchedAt = null) {
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

    if (summary) {
      kpiTotal.textContent = summary.totalAccounts ?? 0;
      kpiHealthy.textContent = summary.healthyAccounts ?? 0;
      kpiWarning.textContent = summary.warningAccounts ?? 0;
      kpiExhausted.textContent = summary.exhaustedAccounts ?? 0;

      if (summary.secondsToEarliestReset !== null && summary.secondsToEarliestReset !== undefined) {
        resetAlertBar.style.display = "flex";
        resetAlertText.textContent = `Earliest quota reset in ${formatSeconds(summary.secondsToEarliestReset)}`;
      } else {
        resetAlertBar.style.display = "none";
      }
    }

    // Render Accounts List
    accountsCount.textContent = accounts.length;

    if (!accounts || accounts.length === 0) {
      accountsList.innerHTML = `
        <div class="empty-state">
          <p>No connected accounts found.</p>
        </div>
      `;
      return;
    }

    accountsList.innerHTML = accounts
      .map((acc) => renderAccountCard(acc))
      .join("");
  }

  function renderAccountCard(acc) {
    const statusClass = `status-${acc.status || "active"}`;
    const quotasHtml = (acc.quotas || [])
      .map((q) => {
        const pct = q.remainingPercentage ?? 0;
        const colorClass = pct > 30 ? "high" : pct > 5 ? "mid" : "low";

        return `
          <div class="quota-row">
            <div class="quota-info">
              <span class="model-name">${escapeHtml(q.name)}</span>
              <span class="model-pct pct-${colorClass}">${pct}%</span>
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
        ? `<div class="reset-line">Resets in: ${formatSeconds(acc.secondsToReset)}</div>`
        : "";

    return `
      <div class="account-card ${acc.status || ""}">
        <div class="account-header">
          <div class="acc-title-area">
            <span class="provider-tag">${escapeHtml(acc.provider || "API")}</span>
            <span class="acc-name" title="${escapeHtml(acc.name)}">${escapeHtml(acc.name)}</span>
          </div>
          <span class="acc-status-tag ${statusClass}">${acc.status || "Active"}</span>
        </div>
        ${quotasHtml ? `<div class="quota-items">${quotasHtml}</div>` : ""}
        ${resetHtml}
      </div>
    `;
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
