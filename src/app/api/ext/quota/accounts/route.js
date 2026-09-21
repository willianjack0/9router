import { NextResponse } from "next/server";
import { authenticateExternalRequest, getCorsHeaders, handleCorsPreflight } from "@/lib/ext/auth";
import { getAllAccountsQuota, aggregateByQuotaBuckets } from "@/lib/ext/quotaService";

export async function OPTIONS(request) {
  return handleCorsPreflight(request);
}

export async function GET(request) {
  const auth = await authenticateExternalRequest(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    const status = url.searchParams.get("status");
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    const accounts = await getAllAccountsQuota({ provider, status, force });
    const quotaBuckets = aggregateByQuotaBuckets(accounts);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        totalAccounts: accounts.length,
        totalQuotaBuckets: quotaBuckets.length,
        quotaBuckets,
        accounts,
      },
      {
        status: 200,
        headers: getCorsHeaders(request),
      }
    );
  } catch (error) {
    console.error("[API Ext Quota Accounts Error]:", error);
    return NextResponse.json(
      { error: "InternalServerError", message: error.message },
      { status: 500, headers: getCorsHeaders(request) }
    );
  }
}
