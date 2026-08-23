# Tervicke Shop

The standalone Tervicke Shop storefront and agent-commerce demo.

This project contains the Next.js shop, SQLite product catalog, `/agents.md`, UCP discovery profile, MCP catalog tools, external shopping-agent CLI, scripts, and tests.

## Run

```bash
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

In another terminal:

```bash
npm run discover -- http://localhost:3000
npm run test:mcp -- http://localhost:3000
```

The reusable Commerce SDK and its standalone catalog package live separately in `../commerce-sdk`.
