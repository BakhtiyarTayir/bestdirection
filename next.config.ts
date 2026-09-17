import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [],
  },
  // Локально Caddy нет: /api/v2/* уходит в api (npm run dev в api/). В проде
  // этот путь до Next не доходит — его забирает Caddy, поэтому только в dev.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const apiUrl = process.env.API_DEV_URL ?? "http://localhost:4000";
    return [{ source: "/api/v2/:path*", destination: `${apiUrl}/api/v2/:path*` }];
  },
};

export default withNextIntl(nextConfig);
