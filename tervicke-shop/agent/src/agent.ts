import type { AgentModel, AgentState, MerchantDiscovery, McpTool } from "./types";
import { MerchantMcpClient } from "./mcp-client";
import { productSummary, searchSummary } from "./format";

const INSTRUCTIONS = `You are an external shopping assistant. Use only the merchant functions supplied to you for product facts. Never invent price, stock, sizes, SKU, description, or URL. Search for new requests. For follow-ups about the selected product, prefer get_product instead of searching again. All INR function price values are integer paise. If asked to buy, say checkout is not yet supported; do not call a tool. Keep answers concise.`;

export class ShoppingAgent {
  readonly state: AgentState;

  constructor(
    private model: AgentModel,
    private mcp: MerchantMcpClient,
    merchant: MerchantDiscovery,
    private tools: McpTool[],
  ) {
    this.state = { messages: [], currentMerchant: merchant, referencedProducts: [] };
  }

  async chat(userText: string) {
    this.state.messages.push({ role: "user", content: userText });

    for (let step = 0; step < 6; step++) {
      const response = await this.model.run(this.state.messages, this.tools, INSTRUCTIONS + this.context());
      if (response.text) {
        this.state.messages.push({ role: "assistant", content: response.text });
        return response.text;
      }
      if (!response.toolCalls?.length) throw new Error("The model returned neither text nor a tool call");

      for (const call of response.toolCalls) {
        this.state.messages.push({ role: "tool_call", name: call.name, callId: call.callId, arguments: JSON.stringify(call.arguments) });
        let result: any;
        try {
          result = await this.mcp.callTool(call.name, call.arguments);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : "Tool failed" };
        }
        this.capture(result);
        const enriched = { ...result, _display: this.display(call.name, result) };
        this.state.messages.push({ role: "tool", callId: call.callId, content: JSON.stringify(enriched) });
      }
    }
    throw new Error("Agent exceeded the maximum tool-call steps");
  }

  private capture(result: any) {
    const products = result?.products || (result?.product ? [result.product] : []);
    if (Array.isArray(products) && products.length) {
      this.state.referencedProducts = products;
      this.state.selectedProduct = products[0];
      this.state.selectedVariant = products[0]?.variants?.[0];
    }
  }

  private display(name: string, result: any) {
    if (name === "search_catalog") return searchSummary(result);
    if (result?.product) return productSummary(result.product, true);
    if (result?.products) return result.products.map((p: any) => productSummary(p, true)).join("\n\n");
  }

  private context() {
    const p: any = this.state.selectedProduct;
    return p ? `\nCurrent referenced product: ${p.title} (id: ${p.id}). Use this ID to resolve phrases like “that one”, size questions, or “show details”.` : "";
  }
}
