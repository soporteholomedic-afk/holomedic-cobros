import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // exceljs resolves modules dynamically and sharp is a native module —
  // keep both out of the server bundle so the standalone output can
  // require them at runtime.
  serverExternalPackages: ['exceljs', 'sharp'],
  allowedDevOrigins: ['172.16.10.20'],
};

export default nextConfig;
