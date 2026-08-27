import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"; import {createMcpServer} from "@/lib/mcp/server";
export const dynamic="force-dynamic"; export async function POST(request:Request){const transport=new WebStandardStreamableHTTPServerTransport();const server=createMcpServer();await server.connect(transport);return transport.handleRequest(request)}
export async function GET(){return Response.json({jsonrpc:"2.0",error:{code:-32000,message:"Use POST with MCP Streamable HTTP."},id:null},{status:405})}
export const DELETE=GET;
