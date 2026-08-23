import { getIdentityService } from "@/lib/identity/runtime";

export const dynamic = "force-dynamic";
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
const html = (body: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tervicke Shop authorization</title><style>body{font:16px system-ui;max-width:36rem;margin:4rem auto;padding:1rem;color:#18181b}main{border:1px solid #ddd;padding:2rem;border-radius:12px}button{background:#111;color:#fff;border:0;padding:.75rem 1rem;border-radius:8px;font-weight:600}</style></head><body><main>${body}</main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'", "x-frame-options": "DENY" } });

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const challenge = await getIdentityService().inspectApprovalToken(token);
  if (!challenge) return html("<h1>Authorization link invalid or expired</h1>", 400);
  return html(`<h1>Authorize Tervicke Shop agent</h1><p><strong>Agent:</strong> ${escapeHtml(challenge.agentId)}</p><p><strong>Email:</strong> ${escapeHtml(challenge.email)}</p><p><strong>Expires:</strong> ${escapeHtml(challenge.expiresAt.toISOString())}</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Authorize agent</button></form>`);
}

export async function POST(request: Request) {
  try {
    const token = String((await request.formData()).get("token") ?? "");
    await getIdentityService().approve(token);
    return html("<h1>Agent authorized</h1><p>You may return to your shopping assistant.</p>");
  } catch { return html("<h1>Authorization request invalid or expired</h1>", 400); }
}
