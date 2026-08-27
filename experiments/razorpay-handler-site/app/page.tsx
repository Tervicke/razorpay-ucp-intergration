"use client";

import { useEffect, useState } from "react";

const primaryNav = ["Overview", "Specification", "Tools"];
const paymentNav = ["Guide", "Razorpay Payment Link", "Template", "Tokenization Guide", "Processor Tokenizer", "Platform Tokenizer", "Encrypted Credential"];

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return <div className="code-block"><button onClick={copy}>{copied ? "Copied" : "Copy"}</button><pre><code>{children}</code></pre></div>;
}

export default function Home() {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  return (
    <div className="site-shell">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">☰</button>
        <a className="brand" href="#top" aria-label="UCP Razorpay documentation home">
          <img src="https://ucp.dev/assets/UCP-small.svg" alt="UCP" />
          <span>Universal Commerce Protocol (UCP)</span>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          {primaryNav.map((item) => <a className={item === "Specification" ? "active" : ""} href="#" key={item}>{item}</a>)}
        </nav>
        <div className="header-actions">
          <div className="search-wrap"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search documentation" placeholder="Search" /><kbd>/</kbd></label>{query && <div className="search-result"><span>On this page</span>{["Prerequisites", "Handler Configuration", "Processing Payments", "Payment Protocol", "Security Considerations"].filter((item) => item.toLowerCase().includes(query.toLowerCase())).map((item) => <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} onClick={() => setQuery("")}>{item}</a>)}</div>}</div>
          <a className="github" href="https://github.com/Universal-Commerce-Protocol/ucp" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </header>

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="version-row"><span>Version</span><button>2026-08-25⌄</button></div>
        <div className="side-section">Payment Handlers</div>
        <nav aria-label="Documentation navigation">
          {paymentNav.map((item) => <a key={item} href={item === "Razorpay Payment Link" ? "#top" : "#"} className={item === "Razorpay Payment Link" ? "selected" : ""}>{item}</a>)}
        </nav>
        <div className="side-section secondary">Common</div>
        <a href="#security-considerations">Security</a>
        <a href="#references">References</a>
      </aside>

      <main className="content" id="top">
        <article>
          <div className="eyebrow">PAYMENT HANDLER</div>
          <h1>Razorpay Payment Link</h1>
          <div className="meta-line"><span><b>Handler name:</b> <code>dev.mock.razorpay_payment_handler</code></span><span><b>Version:</b> <code>2026-04-08</code></span></div>
          <div className="notice"><span>ℹ</span><p>This is the project-specific Razorpay handler implemented by <code>python_ucp_samples</code>. It follows the UCP payment-handler template but is not an official Razorpay UCP specification.</p></div>

          <h2 id="introduction">Introduction<a href="#introduction">¶</a></h2>
          <p>This handler enables a UCP Business to accept payment through a Razorpay-hosted Payment Link. The Business calculates the authoritative checkout amount, reserves inventory, creates the provider payment attempt, and returns a secure URL where the buyer completes payment.</p>
          <h3 id="key-benefits">Key Benefits<a href="#key-benefits">¶</a></h3>
          <ul><li>The Platform never handles raw card, bank-account, or UPI credentials.</li><li>The Business remains authoritative for amount and currency.</li><li>Server-to-server verification occurs before merchant order creation.</li><li>Webhook idempotency prevents duplicate finalization.</li></ul>
          <h3 id="integration-guide">Integration Guide<a href="#integration-guide">¶</a></h3>
          <table><thead><tr><th>Participant</th><th>Integration section</th></tr></thead><tbody><tr><td>Business</td><td><a href="#business-integration">Business Integration</a></td></tr><tr><td>Platform</td><td><a href="#platform-integration">Platform Integration</a></td></tr><tr><td>Razorpay</td><td><a href="#razorpay-integration">Razorpay Integration</a></td></tr></tbody></table>

          <hr />
          <h2 id="participants">Participants<a href="#participants">¶</a></h2>
          <table><thead><tr><th>Participant</th><th>Role</th><th>Prerequisites</th></tr></thead><tbody>
            <tr><td>Business</td><td>Advertises the handler, creates links, verifies payment, and creates the order.</td><td>Razorpay account, API keys, webhook secret.</td></tr>
            <tr><td>Platform</td><td>Submits the instrument, presents the payment URL, and retrieves final checkout state.</td><td>UCP Checkout client and hosted-navigation support.</td></tr>
            <tr><td>Razorpay</td><td>Hosts buyer payment and reports provider payment state.</td><td>Activated Business account.</td></tr>
            <tr><td>Buyer</td><td>Selects a method and pays on the hosted page.</td><td>An accepted payment method.</td></tr>
          </tbody></table>

          <hr />
          <h2 id="business-integration">Business Integration<a href="#business-integration">¶</a></h2>
          <h3 id="prerequisites">Prerequisites<a href="#prerequisites">¶</a></h3>
          <p>Before advertising this handler, Businesses <strong>MUST</strong> complete:</p>
          <ol><li>Create and activate a Razorpay account.</li><li>Obtain a Key ID and Key Secret for the intended mode.</li><li>Ensure successful payments reach <code>captured</code>.</li><li>Configure an HTTPS webhook endpoint and independent webhook secret.</li><li>Store every secret only in server-side secret storage.</li></ol>
          <p><strong>Prerequisites Output:</strong></p>
          <table><thead><tr><th>Field</th><th>Description</th></tr></thead><tbody><tr><td><code>RAZORPAY_KEY_ID</code></td><td>Razorpay API key identifier.</td></tr><tr><td><code>RAZORPAY_KEY_SECRET</code></td><td>Server-only API credential. Never included in UCP payloads.</td></tr><tr><td><code>RAZORPAY_WEBHOOK_SECRET</code></td><td>Server-only secret for validation of the raw webhook body.</td></tr></tbody></table>

          <h3 id="handler-configuration">Handler Configuration<a href="#handler-configuration">¶</a></h3>
          <p>Businesses advertise support in the <code>ucp.payment_handlers</code> registry. The sample currently uses an empty public config; credentials are loaded privately from the server environment.</p>
          <h4>Business Config Fields</h4>
          <table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>
            <tr><td><code>environment</code></td><td>string</td><td>Yes</td><td><code>test</code> or <code>production</code>.</td></tr>
            <tr><td><code>flow</code></td><td>string</td><td>Yes</td><td>Constant <code>payment_link</code>.</td></tr>
            <tr><td><code>supported_currencies</code></td><td>string[]</td><td>Yes</td><td>ISO 4217 currencies accepted by this instance.</td></tr>
            <tr><td><code>accept_partial</code></td><td>boolean</td><td>Yes</td><td>Must be <code>false</code> for this implementation.</td></tr>
            <tr><td><code>key_id</code></td><td>string</td><td>No</td><td>Public Razorpay Key ID. Never the Key Secret.</td></tr>
          </tbody></table>
          <h4>Response Config Fields</h4>
          <table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>
            <tr><td><code>payment_link_id</code></td><td>string</td><td>Yes</td><td>Razorpay Payment Link identifier.</td></tr>
            <tr><td><code>payment_url</code></td><td>URI</td><td>Yes</td><td>HTTPS URL where the buyer pays.</td></tr>
            <tr><td><code>amount</code></td><td>integer</td><td>Yes</td><td>Authoritative total in currency subunits.</td></tr>
            <tr><td><code>currency</code></td><td>string</td><td>Yes</td><td>ISO 4217 checkout currency.</td></tr>
            <tr><td><code>status</code></td><td>string</td><td>Yes</td><td>Provider attempt state, initially <code>created</code>.</td></tr>
          </tbody></table>

          <h4>Example Handler Declaration</h4>
          <CodeBlock>{`{
  "ucp": {
    "version": "2026-04-08",
    "payment_handlers": {
      "dev.mock.razorpay_payment_handler": [{
        "id": "razorpay_mock_payment_handler",
        "name": "razorpay_mock_payment_handler",
        "version": "2026-04-08",
        "spec": "https://merchant.example/ucp/razorpay-payment-link-handler",
        "config": {}
      }]
    }
  }
}`}</CodeBlock>

          <h3 id="processing-payments">Processing Payments<a href="#processing-payments">¶</a></h3>
          <p>Upon receiving a matching instrument, Businesses <strong>MUST</strong>:</p>
          <ol>
            <li><strong>Validate Handler:</strong> confirm the submitted handler ID and <code>hosted_checkout</code> type.</li>
            <li><strong>Ensure Idempotency:</strong> bind processing to the UCP idempotency key and request body.</li>
            <li><strong>Validate Checkout:</strong> require valid fulfillment selections before accepting completion.</li>
            <li><strong>Calculate Amount:</strong> read exactly one authoritative server-side checkout total.</li>
            <li><strong>Reserve Inventory:</strong> create a time-limited atomic reservation.</li>
            <li><strong>Create Payment Link:</strong> send amount, currency, reference, and expiry to Razorpay.</li>
            <li><strong>Return Accepted Completion:</strong> respond with <code>complete_in_progress</code>, no order, and the hosted URL.</li>
            <li><strong>Verify Success:</strong> require captured state plus exact order, amount, currency, and reservation matches.</li>
            <li><strong>Finalize Once:</strong> consume the reservation, create the order, and return <code>completed</code>.</li>
          </ol>

          <h4>Complete Checkout Request</h4>
          <CodeBlock>{`POST /checkout-sessions/checkout_123/complete
Idempotency-Key: 36b83812-d52a-43e7-8b66-a6e6170b639b
Content-Type: application/json

{
  "payment": {
    "instruments": [{
      "id": "razorpay_checkout",
      "handler_id": "razorpay_mock_payment_handler",
      "type": "hosted_checkout"
    }]
  }
}`}</CodeBlock>

          <h4>Accepted Asynchronous Response</h4>
          <CodeBlock>{`{
  "id": "checkout_123",
  "status": "complete_in_progress",
  "currency": "INR",
  "payment": {
    "razorpay": {
      "payment_link_id": "plink_example",
      "payment_url": "https://rzp.io/i/example",
      "amount": 125000,
      "currency": "INR",
      "status": "created"
    }
  }
}`}</CodeBlock>

          <hr />
          <h2 id="platform-integration">Platform Integration<a href="#platform-integration">¶</a></h2>
          <h3 id="platform-prerequisites">Prerequisites<a href="#platform-prerequisites">¶</a></h3>
          <p>The Platform does not need Razorpay API credentials. It must support UCP discovery, Complete Checkout, Get Checkout, HTTPS hosted navigation, and preservation of the original idempotency key.</p>
          <h3 id="payment-protocol">Payment Protocol<a href="#payment-protocol">¶</a></h3>
          <h4>Step 1: Discover Handler</h4><p>Read <code>/.well-known/ucp</code> and select the advertised <code>razorpay_mock_payment_handler</code> instance.</p>
          <h4>Step 2: Prepare Instrument</h4><p>Construct a reference-only <code>hosted_checkout</code> instrument. It must not carry an amount, API secret, or raw payment credential.</p>
          <h4>Step 3: Complete Checkout</h4><p>Submit the instrument once. <code>complete_in_progress</code> means completion was accepted, not that funds were captured. Do not start another Complete Checkout operation.</p>
          <h4>Step 4: Present Hosted Payment</h4><p>Open the returned HTTPS <code>payment_url</code> for the buyer. Production clients should enforce an allowlist of trusted Razorpay hosts.</p>
          <h4>Step 5: Retrieve Final Checkout</h4><p>After the provider flow, call Get Checkout. A <code>completed</code> response with <code>order</code> is authoritative. The sample client performs one retrieval after its configured wait; production clients should use bounded backoff until <code>expires_at</code>.</p>
          <CodeBlock>{`{
  "id": "checkout_123",
  "status": "completed",
  "currency": "INR",
  "order": {
    "id": "order_merchant_123",
    "permalink_url": "https://merchant.example/orders/order_merchant_123"
  }
}`}</CodeBlock>

          <h2 id="payment-action">Payment Action<a href="#payment-action">¶</a></h2>
          <div className="warning"><span>!</span><p>The sample returns <code>payment.razorpay.payment_url</code> as a project-specific extension. A production UCP 2026-08-25 handler should declare a negotiated custom Action with trusted-URL, expiry, fallback, and completion rules.</p></div>
          <table><thead><tr><th>Action</th><th>When emitted</th><th>Gated effect</th><th>Requirements</th></tr></thead><tbody><tr><td>Open <code>payment_url</code></td><td>Complete Checkout creates a link.</td><td>Captured payment and order creation.</td><td>HTTPS provider URL, checkout binding, aligned expiry.</td></tr></tbody></table>

          <hr />
          <h2 id="razorpay-integration">Razorpay Integration<a href="#razorpay-integration">¶</a></h2>
          <h3>Payment Link</h3><p>The Business creates a Standard Payment Link using the checkout total in currency subunits, checkout currency, <code>accept_partial: false</code>, checkout ID as the reference, and an expiry aligned with the inventory hold.</p>
          <h3>Webhooks</h3>
          <table><thead><tr><th>Event</th><th>Behaviour</th></tr></thead><tbody>
            <tr><td><code>payment_link.paid</code></td><td>Resolve link, order, and payment; then verify and finalize.</td></tr>
            <tr><td><code>payment.captured</code></td><td>Verify captured payment and finalize.</td></tr>
            <tr><td><code>order.paid</code></td><td>Verify the associated captured payment and finalize.</td></tr>
            <tr><td><code>payment.failed</code></td><td>Mark the attempt failed and release held inventory.</td></tr>
          </tbody></table>

          <h2 id="error-handling">Error Handling<a href="#error-handling">¶</a></h2>
          <table><thead><tr><th>Condition</th><th>Required behaviour</th></tr></thead><tbody>
            <tr><td>Unsupported handler or instrument</td><td>Reject before creating a provider attempt.</td></tr>
            <tr><td>Missing Razorpay credentials</td><td>Return an unrecoverable configuration error.</td></tr>
            <tr><td>Invalid total or unavailable stock</td><td>Reject and roll back the local transaction.</td></tr>
            <tr><td>Payment remains unpaid</td><td>Keep <code>complete_in_progress</code> until expiry or cancellation.</td></tr>
            <tr><td>Provider data mismatch</td><td>Do not create an order; apply failure and recovery policy.</td></tr>
            <tr><td>Duplicate webhook</td><td>Return success without finalizing twice.</td></tr>
          </tbody></table>

          <hr />
          <h2 id="security-considerations">Security Considerations<a href="#security-considerations">¶</a></h2>
          <table><thead><tr><th>Requirement</th><th>Description</th></tr></thead><tbody>
            <tr><td>Secret isolation</td><td>API and webhook secrets remain server-side and never enter UCP payloads or logs.</td></tr>
            <tr><td>Authoritative amount</td><td>The Business derives amount and currency from its persisted checkout.</td></tr>
            <tr><td>Attempt binding</td><td>Provider reference, local attempt, and reservation bind payment to one checkout.</td></tr>
            <tr><td>Capture verification</td><td>Order creation requires exact order, amount, currency, and captured-state matches.</td></tr>
            <tr><td>Webhook signature</td><td>Validate <code>X-Razorpay-Signature</code> over the exact raw request body.</td></tr>
            <tr><td>Webhook idempotency</td><td>Deduplicate using <code>X-Razorpay-Event-Id</code> and persisted event IDs.</td></tr>
            <tr><td>Event ordering</td><td>Never assume events arrive once or chronologically.</td></tr>
          </tbody></table>

          <h2 id="references">References<a href="#references">¶</a></h2>
          <ul className="references">
            <li><a href="https://ucp.dev/2026-08-25/specification/payment/template/" target="_blank" rel="noreferrer">UCP Payment Handler Template</a></li>
            <li><a href="https://ucp.dev/2026-08-25/specification/payment/guide/" target="_blank" rel="noreferrer">UCP Payment Handler Guide</a></li>
            <li><a href="https://razorpay.com/docs/api/payments/payment-links/" target="_blank" rel="noreferrer">Razorpay Payment Links APIs</a></li>
            <li><a href="https://razorpay.com/docs/webhooks/payment-links/" target="_blank" rel="noreferrer">Razorpay Payment Link webhook events</a></li>
            <li><a href="https://razorpay.com/docs/webhooks/validate-test/" target="_blank" rel="noreferrer">Razorpay webhook validation</a></li>
          </ul>

          <footer><a href="#">Previous<br/><strong>Guide</strong></a><a className="next" href="#">Next<br/><strong>Template</strong></a></footer>
        </article>
      </main>

      <aside className="toc">
        <div className="toc-title">Table of contents</div>
        <a href="#introduction">Introduction</a><a className="nested" href="#key-benefits">Key Benefits</a><a className="nested" href="#integration-guide">Integration Guide</a><a href="#participants">Participants</a><a href="#business-integration">Business Integration</a><a className="nested active" href="#prerequisites">Prerequisites</a><a className="nested" href="#handler-configuration">Handler Configuration</a><a href="#platform-integration">Platform Integration</a><a href="#security-considerations">Security Considerations</a><a href="#references">References</a>
        <button className="theme-toggle" onClick={() => setDark(!dark)}><span>{dark ? "☀" : "☾"}</span>{dark ? "Light mode" : "Dark mode"}</button>
      </aside>
    </div>
  );
}
