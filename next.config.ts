import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.16.10.20'],
  // `better-sqlite3` is a native Node addon (better_sqlite3.node). Next must
  // NOT try to bundle it into the server/edge bundle — it has to stay an
  // external require so the prebuilt binary loads at runtime. This also
  // keeps it out of any client bundle (SQLite access is server-only).
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
