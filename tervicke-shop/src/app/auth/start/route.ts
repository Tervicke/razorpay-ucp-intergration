import { randomBytes } from "node:crypto";
import { getIdentityService } from "@/lib/identity/runtime";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const clientId = request.headers.get("x-client-id")?.trim();
    const body = await request.json() as { email?: unknown; agentId?: unknown };
    if (!clientId || typeof body.email !== "string" || typeof body.agentId !== "string") return Response.json({ error: "Invalid request" }, { status: 400 });
    const clientVerifier = randomBytes(32).toString("base64url");
    const started = await getIdentityService().startAuthentication({ email: body.email, agentId: body.agentId, clientId, clientVerifier });
    return Response.json({ ...started.challenge, clientVerifier }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Request could not be completed" }, { status: 400 }); }
}
