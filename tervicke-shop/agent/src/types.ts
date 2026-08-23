export type MerchantDiscovery={merchantName:string;baseUrl:string;agentsUrl:string;ucpUrl:string;mcpEndpoint:string;capabilities:string[];agentsMarkdown:string};
export type McpTool={name:string;description?:string;inputSchema:Record<string,unknown>};
export type AgentMessage={role:"user"|"assistant";content:string}|{role:"tool_call";name:string;callId:string;arguments:string}|{role:"tool";callId:string;content:string};
export type ModelToolCall={name:string;callId:string;arguments:Record<string,unknown>};
export type ModelResponse={text?:string;toolCalls?:ModelToolCall[]};
export interface AgentModel{run(messages:AgentMessage[],tools:McpTool[],instructions:string):Promise<ModelResponse>}
export type AgentState={messages:AgentMessage[];currentMerchant:MerchantDiscovery;referencedProducts:Record<string,unknown>[];selectedProduct?:Record<string,unknown>;selectedVariant?:Record<string,unknown>};
