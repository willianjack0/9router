import { getProviderConnections, getProviderConnectionById } from "@/lib/localDb";
import { getUsageForProvider } from "open-sse/services/usage.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { USAGE_APIKEY_PROVIDERS, USAGE_SUPPORTED_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";
import { refreshAndUpdateCredentials } from "@/app/api/usage/[connectionId]/route.js";
import { parseQuotaData, calculatePercentage, getRemainingPercentage } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

// In-memory cache for fast responses to extension/desktop polling
const quotaMemoryCache = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds cache

export function isUsageEligible(connection) {
  if (!connection || !connection.provider) return false;
  return (
    USAGE_SUPPORTED_PROVIDERS.includes(connection.provider) &&
    (connection.authType === "oauth" ||
      connection.authType === "apikey" ||
      connection.authType === "api_key" ||
      USAGE_APIKEY_PROVIDERS.includes(connection.provider))
  );
}

function computeSecondsToReset(resetAt) {
  if (!resetAt) return null;
  const target = new Date(resetAt).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = Math.max(0, Math.round((target - Date.now()) / 1000));
  return diff;
}

/**
 * Fetch usage for a single connection, utilizing cache unless force=true
 */
export async function getSingleAccountQuota(connection, { force = false } = {}) {
  const cacheKey = connection.id;
  const cached = quotaMemoryCache.get(cacheKey);
  const now = Date.now();

  if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const proxyConfig = await resolveConnectionProxyConfig(connection.providerSpecificData);
  const proxyOptions = {
    connectionProxyEnabled: proxyConfig.connectionProxyEnabled === true,
    connectionProxyUrl: proxyConfig.connectionProxyUrl || "",
    connectionNoProxy: proxyConfig.connectionNoProxy || "",
    vercelRelayUrl: proxyConfig.vercelRelayUrl || "",
    strictProxy: false,
  };

  let activeConn = connection;
  if (connection.authType === "oauth") {
    try {
      const refreshed = await refreshAndUpdateCredentials(connection, false, proxyOptions);
      activeConn = refreshed.connection || connection;
    } catch (err) {
      console.warn(`[QuotaService] Token refresh failed for ${connection.id}: ${err.message}`);
    }
  }

  let rawUsage = null;
  let errorMsg = null;
  try {
    rawUsage = await getUsageForProvider(activeConn, proxyOptions, { force });
  } catch (err) {
    errorMsg = err.message || "Failed to fetch quota";
  }

  const parsedQuotas = parseQuotaData(connection.provider, rawUsage);

  // Normalize quotas with percentage and countdown
  const quotas = parsedQuotas.map((q) => {
    const pct = getRemainingPercentage(q);
    const secs = computeSecondsToReset(q.resetAt);
    return {
      name: q.name,
      modelKey: q.modelKey || null,
      used: q.used ?? 0,
      total: q.total ?? 0,
      remaining: q.remaining ?? Math.max(0, (q.total || 0) - (q.used || 0)),
      remainingPercentage: pct,
      resetAt: q.resetAt || null,
      secondsToReset: secs,
      unit: q.unit || "tokens",
    };
  });

  // Determine overall status for this account
  let minRemainingPct = 100;
  let earliestResetAt = null;

  for (const q of quotas) {
    if (q.remainingPercentage < minRemainingPct) {
      minRemainingPct = q.remainingPercentage;
    }
    if (q.resetAt) {
      const qReset = new Date(q.resetAt).getTime();
      if (!earliestResetAt || qReset < new Date(earliestResetAt).getTime()) {
        earliestResetAt = q.resetAt;
      }
    }
  }

  let status = "active";
  if (connection.isActive === false) {
    status = "disabled";
  } else if (minRemainingPct <= 5) {
    status = "exhausted";
  } else if (minRemainingPct <= 30) {
    status = "warning";
  }

  const accountResult = {
    id: connection.id,
    name: connection.name || connection.displayName || connection.email || connection.id,
    email: connection.email || null,
    provider: connection.provider,
    providerLabel: AI_PROVIDERS[connection.provider]?.name || connection.provider,
    authType: connection.authType,
    isActive: connection.isActive ?? true,
    status,
    priority: connection.priority ?? 0,
    minRemainingPercentage: quotas.length > 0 ? minRemainingPct : 100,
    earliestResetAt,
    secondsToReset: computeSecondsToReset(earliestResetAt),
    quotas,
    lastError: errorMsg || rawUsage?.message || null,
    fetchedAt: new Date().toISOString(),
  };

  quotaMemoryCache.set(cacheKey, { timestamp: now, data: accountResult });
  return accountResult;
}

/**
 * Fetch all accounts with their quota status
 */
export async function getAllAccountsQuota({ provider = null, status = null, force = false } = {}) {
  const allConnections = await getProviderConnections();
  const eligible = allConnections.filter(isUsageEligible);

  let filtered = eligible;
  if (provider && provider !== "all") {
    filtered = filtered.filter((c) => c.provider === provider);
  }

  if (status === "active") {
    filtered = filtered.filter((c) => (c.isActive ?? true));
  } else if (status === "inactive" || status === "disabled") {
    filtered = filtered.filter((c) => c.isActive === false);
  }

  const accounts = await Promise.all(
    filtered.map((conn) => getSingleAccountQuota(conn, { force }))
  );

  return accounts;
}

/**
 * Aggregate account quotas into model/quota buckets
 */
export function aggregateByQuotaBuckets(accounts = []) {
  const bucketMap = new Map();

  for (const acc of accounts) {
    if (acc.isActive === false) continue; // Skip disabled accounts
    for (const q of acc.quotas || []) {
      const bucketKey = q.name || "Default";
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          name: q.name,
          modelKey: q.modelKey || null,
          unit: q.unit || "tokens",
          totalAccounts: 0,
          availableAccounts: 0,
          exhaustedAccounts: 0,
          highestRemainingPercentage: 0,
          lowestRemainingPercentage: 100,
          earliestResetAt: null,
          secondsToEarliestReset: null,
          accounts: [],
        });
      }

      const b = bucketMap.get(bucketKey);
      b.totalAccounts++;
      const pct = q.remainingPercentage ?? 0;
      if (pct > 5) {
        b.availableAccounts++;
      } else {
        b.exhaustedAccounts++;
      }

      if (pct > b.highestRemainingPercentage) b.highestRemainingPercentage = pct;
      if (pct < b.lowestRemainingPercentage) b.lowestRemainingPercentage = pct;

      if (q.resetAt) {
        const qTime = new Date(q.resetAt).getTime();
        if (!b.earliestResetAt || qTime < new Date(b.earliestResetAt).getTime()) {
          b.earliestResetAt = q.resetAt;
          b.secondsToEarliestReset = computeSecondsToReset(q.resetAt);
        }
      }

      b.accounts.push({
        accountId: acc.id,
        accountName: acc.name,
        email: acc.email,
        provider: acc.provider,
        providerLabel: acc.providerLabel,
        remaining: q.remaining,
        used: q.used,
        total: q.total,
        remainingPercentage: pct,
        resetAt: q.resetAt,
        secondsToReset: q.secondsToReset,
        status: pct <= 5 ? "exhausted" : pct <= 30 ? "warning" : "active",
      });
    }
  }

  return Array.from(bucketMap.values()).map((b) => {
    b.accounts.sort((a, c) => (c.remainingPercentage || 0) - (a.remainingPercentage || 0));
    b.status =
      b.availableAccounts === 0
        ? "exhausted"
        : b.availableAccounts < b.totalAccounts
        ? "partial"
        : "healthy";
    return b;
  });
}

/**
 * Build consolidated summary across all accounts and quota buckets
 */
export async function getQuotaSummary({ force = false } = {}) {
  const accounts = await getAllAccountsQuota({ force });
  const quotaBuckets = aggregateByQuotaBuckets(accounts);

  let totalAccounts = accounts.length;
  let activeAccounts = 0;
  let exhaustedAccounts = 0;
  let warningAccounts = 0;
  let healthyAccounts = 0;
  let earliestResetAt = null;

  for (const acc of accounts) {
    if (acc.isActive) activeAccounts++;
    if (acc.status === "exhausted") exhaustedAccounts++;
    else if (acc.status === "warning") warningAccounts++;
    else if (acc.status === "active") healthyAccounts++;

    if (acc.earliestResetAt) {
      const targetTime = new Date(acc.earliestResetAt).getTime();
      if (!earliestResetAt || targetTime < new Date(earliestResetAt).getTime()) {
        earliestResetAt = acc.earliestResetAt;
      }
    }
  }

  // Quota bucket metrics
  let totalQuotaBuckets = quotaBuckets.length;
  let healthyQuotaBuckets = 0;
  let partialQuotaBuckets = 0;
  let exhaustedQuotaBuckets = 0;

  for (const b of quotaBuckets) {
    if (b.status === "healthy") healthyQuotaBuckets++;
    else if (b.status === "partial") partialQuotaBuckets++;
    else if (b.status === "exhausted") exhaustedQuotaBuckets++;
  }

  return {
    timestamp: new Date().toISOString(),
    totalAccounts,
    activeAccounts,
    exhaustedAccounts,
    warningAccounts,
    healthyAccounts,
    // Quota bucket totals
    totalQuotaBuckets,
    healthyQuotaBuckets,
    partialQuotaBuckets,
    exhaustedQuotaBuckets,
    quotaBuckets,
    systemStatus:
      exhaustedAccounts > 0 && activeAccounts === exhaustedAccounts
        ? "critical"
        : exhaustedAccounts > 0
        ? "warning"
        : "healthy",
    earliestResetAt,
    secondsToEarliestReset: computeSecondsToReset(earliestResetAt),
  };
}
