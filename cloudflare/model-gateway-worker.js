/**
 * Cloudflare Worker — model gateway (sign + serve from R2).
 *
 * Required bindings / vars:
 *   - env.MODELS        R2 bucket binding
 *   - env.SIGNING_SECRET
 *   - env.PUBLIC_BASE_URL  (optional) e.g. https://model-gateway.shawnk7705.workers.dev
 *
 * If PUBLIC_BASE_URL is not set, the worker origin is used automatically.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/sign") {
      const file = url.searchParams.get("file");

      if (!file) {
        return new Response("Missing file", {
          status: 400,
          headers: corsHeaders,
        });
      }

      const key = file.replace(/^\/+/, "");
      const exp = Math.floor(Date.now() / 1000) + 60 * 10;
      const sig = await sign(key, exp, env.SIGNING_SECRET);

      const baseUrl = (env.PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
      const signedUrl = `${baseUrl}/${key}?exp=${exp}&sig=${sig}`;

      return new Response(JSON.stringify({ url: signedUrl }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const key = url.pathname.replace(/^\/+/, "");
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig");

    if (!key || !exp || !sig) {
      return new Response("Missing params", {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (Math.floor(Date.now() / 1000) > exp) {
      return new Response("Link expired", {
        status: 403,
        headers: corsHeaders,
      });
    }

    const expectedSig = await sign(key, exp, env.SIGNING_SECRET);

    if (sig !== expectedSig) {
      return new Response("Invalid signature", {
        status: 403,
        headers: corsHeaders,
      });
    }

    const object = await env.MODELS.get(key);

    if (!object) {
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "model/gltf-binary",
        "Cache-Control": "private, max-age=0",
        ...corsHeaders,
      },
    });
  },
};

async function sign(key, exp, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${key}.${exp}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);

  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
