import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // exceljs resolves modules dynamically — keep it out of the server bundle
  // so standalone output can require it at runtime.
  serverExternalPackages: ['exceljs'],
  allowedDevOrigins: ['172.16.10.20'],
};

export default nextConfig;
