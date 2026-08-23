import { getIdentityService } from "@/lib/identity/runtime";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const clientId = request.headers.get("x-client-id")?.trim();
    const body = await request.json() as { challengeId?: unknown; clientVerifier?: unknown };
    if (!clientId || typeof body.challengeId !== "string" || typeof body.clientVerifier !== "string") return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json(await getIdentityService().exchange(body.challengeId, body.clientVerifier, clientId), { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Request could not be completed" }, { status: 400 }); }
}
