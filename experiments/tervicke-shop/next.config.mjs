/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],

  async headers() {
    return [
      {
        source: "/agents.md",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain; charset=utf-8",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
