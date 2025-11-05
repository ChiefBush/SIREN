import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const u = new URL(req.url);
  const deviceId = u.searchParams.get("device_id") ?? "EDGE-001";
  const limit = Number(u.searchParams.get("limit") ?? "50");

  const project = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = `${project}/rest/v1/telemetry?device_id=eq.${deviceId}&order=ts.desc&limit=${limit}`;

  const res = await fetch(url, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` }
  });

  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}); 