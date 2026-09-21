import { NextResponse } from "next/server";
import { authenticateExternalRequest, getCorsHeaders, handleCorsPreflight } from "@/lib/ext/auth";
import { getQuotaSummary } from "@/lib/ext/quotaService";

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
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    const summary = await getQuotaSummary({ force });
    return NextResponse.json(summary, {
      status: 200,
      headers: getCorsHeaders(request),
    });
  } catch (error) {
    console.error("[API Ext Quota Summary Error]:", error);
    return NextResponse.json(
      { error: "InternalServerError", message: error.message },
      { status: 500, headers: getCorsHeaders(request) }
    );
  }
}
