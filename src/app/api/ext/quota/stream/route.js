import { authenticateExternalRequest, getCorsHeaders, handleCorsPreflight } from "@/lib/ext/auth";
import { getQuotaSummary } from "@/lib/ext/quotaService";

export const dynamic = "force-dynamic";

export async function OPTIONS(request) {
  return handleCorsPreflight(request);
}

export async function GET(request) {
  const auth = await authenticateExternalRequest(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const cors = getCorsHeaders(request);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = async () => {
        if (isClosed) return;
        try {
          const summary = await getQuotaSummary();
          const message = `event: quota_summary\ndata: ${JSON.stringify(summary)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (err) {
          console.warn("[Quota SSE] Failed to emit event:", err.message);
        }
      };

      // Send initial state immediately
      await sendEvent();

      // Emit update every 15 seconds
      const intervalId = setInterval(sendEvent, 15000);

      request.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(intervalId);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
