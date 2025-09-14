// Deno Deploy (Supabase Edge Function)
// Deploy with: supabase functions deploy process-run --no-verify-jwt
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const { runId, projectId } = await req.json();
    // TODO: fetch context, call LLM, write results back
    return new Response(JSON.stringify({ ok: true, runId, projectId }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});

