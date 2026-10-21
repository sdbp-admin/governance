const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(req => {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin === "https://sdbp-admin.github.io" || /^http:\/\/localhost:\d+$/.test(origin);
  const cors = { ...baseCors, "Access-Control-Allow-Origin": allowed ? origin : "https://sdbp-admin.github.io" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers: cors });
  const publicKey = Deno.env.get("BOARD_VAPID_PUBLIC_KEY");
  if (!publicKey) return Response.json({ error: "Board push is not configured." }, { status: 503, headers: cors });
  return Response.json({ publicKey }, { headers: cors });
});
