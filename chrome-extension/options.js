// 9router Quota Monitor - Options Logic

document.addEventListener("DOMContentLoaded", async () => {
  const baseUrlInput = document.getElementById("baseUrl");
  const apiKeyInput = document.getElementById("apiKey");
  const refreshIntervalSelect = document.getElementById("refreshInterval");
  const badgeModeSelect = document.getElementById("badgeMode");
  const enableNotificationsCheck = document.getElementById("enableNotifications");
  const toastMessage = document.getElementById("toastMessage");
  const settingsForm = document.getElementById("settingsForm");
  const testBtn = document.getElementById("testBtn");

  // Load existing settings
  const config = await chrome.storage.local.get({
    baseUrl: "https://apia.fishlab.com.br",
    apiKey: "sk-ecec8cc806d4fcd4-g9k4oo-e054de89",
    refreshInterval: 30,
    enableNotifications: true,
    badgeMode: "status",
  });

  baseUrlInput.value = config.baseUrl;
  apiKeyInput.value = config.apiKey;
  refreshIntervalSelect.value = String(config.refreshInterval);
  badgeModeSelect.value = config.badgeMode;
  enableNotificationsCheck.checked = config.enableNotifications;

  // Save Settings
  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newSettings = {
      baseUrl: baseUrlInput.value.trim().replace(/\/+$/, ""),
      apiKey: apiKeyInput.value.trim(),
      refreshInterval: parseInt(refreshIntervalSelect.value, 10),
      badgeMode: badgeModeSelect.value,
      enableNotifications: enableNotificationsCheck.checked,
    };

    await chrome.storage.local.set(newSettings);

    // Notify background worker to reconfigure alarms & re-sync
    chrome.runtime.sendMessage({
      action: "update_settings",
      settings: newSettings,
    });

    showToast("Settings saved and sync updated successfully!", "success");
  });

  // Test Connection
  testBtn.addEventListener("click", async () => {
    const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");
    const apiKey = apiKeyInput.value.trim();

    if (!baseUrl) {
      showToast("Please enter a valid Base URL.", "error");
      return;
    }

    testBtn.textContent = "Testing...";
    testBtn.disabled = true;

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/api/ext/quota/summary`, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      showToast(
        `Connection successful! Found ${data.totalAccounts} accounts (${data.activeAccounts} active).`,
        "success"
      );
    } catch (err) {
      showToast(`Connection failed: ${err.message}`, "error");
    } finally {
      testBtn.textContent = "Test Connection";
      testBtn.disabled = false;
    }
  });

  function showToast(message, type) {
    toastMessage.textContent = message;
    toastMessage.className = `toast ${type}`;
    setTimeout(() => {
      toastMessage.className = "toast";
    }, 5000);
  }
});
