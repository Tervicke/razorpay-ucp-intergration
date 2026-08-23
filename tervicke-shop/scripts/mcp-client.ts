import {Client} from "@modelcontextprotocol/sdk/client/index.js"; import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
export async function connectMcp(url:string){const client=new Client({name:"tervicke-demo-client",version:"1.0.0"});await client.connect(new StreamableHTTPClientTransport(new URL(url)));return client;}
export function structured(result:any){if(result.structuredContent)return result.structuredContent;const text=result.content?.find((x:any)=>x.type==="text")?.text;return text?JSON.parse(text):result;}
