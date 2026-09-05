import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // exceljs resolves modules dynamically and sharp is a native module —
  // keep both out of the server bundle so the standalone output can
  // require them at runtime.
  serverExternalPackages: ['exceljs', 'sharp'],
  // The standalone tracer (@vercel/nft) copies sharp's JS and the platform
  // `.node` binaries, but drops the ELF shared libraries those binaries
  // load via the dynamic linker (DT_NEEDED) — `libvips-cpp.so.8.18.6` +
  // `glib-2.0/` inside `@img/sharp-libvips-*`. Without them
  // `require('sharp')` fails in the Docker standalone image with
  // ERR_DLOPEN_FAILED. Force-include every native sharp package across all
  // three platform families (linux glibc, linux musl, win32) so dev,
  // alpine Docker and the Windows SDK all trace correctly; patterns for
  // packages absent from a given store simply match nothing.
  // Route key: '/*' is the documented global key applying the includes to
  // every route (Next 16 `outputFileTracingIncludes` docs).
  outputFileTracingIncludes: {
    '/*': [
      'node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/**/*',
      'node_modules/.pnpm/@img+sharp-libvips-linuxmusl-x64@*/**/*',
      'node_modules/.pnpm/@img+sharp-libvips-win32-x64@*/**/*',
      'node_modules/.pnpm/@img+sharp-linux-x64@*/**/*',
      'node_modules/.pnpm/@img+sharp-linuxmusl-x64@*/**/*',
      'node_modules/.pnpm/@img+sharp-win32-x64@*/**/*',
    ],
  },
  allowedDevOrigins: ['172.16.10.20'],
};

export default nextConfig;
