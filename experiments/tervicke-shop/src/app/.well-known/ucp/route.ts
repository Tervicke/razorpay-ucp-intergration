import {ucpProfile} from "@/lib/ucp/profile"; export const dynamic="force-dynamic"; export async function GET(){return Response.json(ucpProfile(),{headers:{"cache-control":"public, max-age=300"}})}
