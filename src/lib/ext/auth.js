import { NextResponse } from "next/server";
import { validateApiKey, getSettings } from "@/lib/localDb";
import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";

/**
 * Build standard CORS headers allowing Chrome extensions and configured origins
 */
export function getCorsHeaders(request) {
  const origin = request?.headers?.get("origin") || "*";
  const allowedCustom = process.env.NINEROUTER_EXT_CORS_ORIGINS;

  let allowOrigin = "*";
  if (origin && origin !== "null") {
    if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
      allowOrigin = origin;
    } else if (allowedCustom) {
      const allowedList = allowedCustom.split(",").map((s) => s.trim());
      if (allowedList.includes("*") || allowedList.includes(origin)) {
        allowOrigin = origin;
      }
    } else {
      allowOrigin = "*";
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key, x-goog-api-key",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Handle CORS preflight OPTIONS request
 */
export function handleCorsPreflight(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * Extract API token from request headers or query params
 */
export function extractExternalToken(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) return xApiKey.trim();

  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key") || url.searchParams.get("apiKey");
  if (queryKey) return queryKey.trim();

  return null;
}

/**
 * Authenticate external request
 * Returns { authorized: true } or NextResponse with 401
 */
export async function authenticateExternalRequest(request) {
  // Check if API key is globally not required
  if (process.env.REQUIRE_API_KEY === "false") {
    try {
      const settings = await getSettings();
      if (settings?.requireApiKey === false) {
        return { authorized: true };
      }
    } catch {
      return { authorized: true };
    }
  }

  const token = extractExternalToken(request);

  // 1. Check dedicated external master key
  const extApiKey = process.env.NINEROUTER_EXT_API_KEY;
  if (extApiKey && token && token === extApiKey) {
    return { authorized: true, role: "master" };
  }

  // 2. Check 9router registered API keys
  if (token) {
    const isValidKey = await validateApiKey(token);
    if (isValidKey) {
      return { authorized: true, role: "api_key" };
    }
  }

  // 3. Fallback: check dashboard session cookie (allows dashboard UI to reuse external endpoints)
  const sessionCookie = request.cookies?.get("auth_token")?.value;
  if (sessionCookie && (await verifyDashboardAuthToken(sessionCookie))) {
    return { authorized: true, role: "dashboard_session" };
  }

  return {
    authorized: false,
    response: NextResponse.json(
      {
        error: "Unauthorized",
        message: "A valid Bearer token or X-API-Key is required.",
      },
      {
        status: 401,
        headers: getCorsHeaders(request),
      }
    ),
  };
}
