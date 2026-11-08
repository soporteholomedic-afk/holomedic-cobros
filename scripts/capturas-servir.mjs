#!/usr/bin/env node
// capturas-servir.mjs — Zero-dependency HTTP server for the capturas/ folder.
//
// Usage:
//   node scripts/capturas-servir.mjs [opciones]
//
// Options:
//   --puerto <n>       Port to listen on (default: 8899)
//   --host <ip>        Bind address (default: 0.0.0.0 — reachable via VPN/LAN)
//   --directorio <d>   Folder to serve (default: capturas, relative to repo root)
//   --ayuda            Show this help
//
// Intended to run as a systemd user service (see docs/capturas-playwright.md):
//   systemctl --user status capturas

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
};

function printHelp() {
  console.log(`capturas-servir — sirve la carpeta de capturas por HTTP

Uso:
  node scripts/capturas-servir.mjs [opciones]

Opciones:
  --puerto <n>       Puerto de escucha (por defecto: 8899)
  --host <ip>        Dirección de bind (por defecto: 0.0.0.0)
  --directorio <d>   Carpeta a servir (por defecto: capturas)
  --ayuda            Muestra esta ayuda
`);
}

function parseArgs(argv) {
  const args = { puerto: 8899, host: '0.0.0.0', directorio: 'capturas', ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`La opción ${arg} requiere un valor.`);
      return argv[i];
    };
    switch (arg) {
      case '--puerto': args.puerto = Number.parseInt(next(), 10); break;
      case '--host': args.host = next(); break;
      case '--directorio': args.directorio = next(); break;
      case '--ayuda': case '--help': case '-h': args.ayuda = true; break;
      default:
        if (arg.startsWith('-')) throw new Error(`Opción desconocida: ${arg}`);
        throw new Error(`Argumento inesperado: ${arg}`);
    }
  }
  return args;
}

function validateArgs(args) {
  if (!Number.isFinite(args.puerto) || args.puerto < 1 || args.puerto > 65535) {
    throw new Error(`--puerto inválido: ${args.puerto}`);
  }
}

/** Resolve a request path to an absolute file path inside root, rejecting
 *  anything that escapes the served folder (path traversal guard). */
function resolverRutaSegura(root, urlPath) {
  const segmentos = decodeURIComponent(urlPath).split('/');
  if (segmentos.some((p) => p === '..')) return null; // reject, never silently drop
  const rel = segmentos
    .filter((p) => p.length > 0 && p !== '.')
    .join('/');
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function escaparHtml(texto) {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function paginaListado(root, relDir, entradas) {
  const filas = entradas
    .map((e) => {
      const href = `/${[relDir, e.nombre].filter(Boolean).join('/')}`;
      return `<tr><td><a href="${escaparHtml(href)}">${escaparHtml(e.nombre)}</a></td>` +
        `<td>${e.esDir ? 'carpeta' : formatBytes(e.bytes)}</td>` +
        `<td>${e.fecha.toISOString().replace('T', ' ').slice(0, 19)}</td></tr>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Capturas — ${escaparHtml(relDir || 'raíz')}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #fafafa; }
  h1 { font-size: 1.2rem; }
  table { border-collapse: collapse; width: 100%; max-width: 900px; }
  td, th { text-align: left; padding: 0.4rem 0.75rem; border-bottom: 1px solid #e5e5e5; }
  td:nth-child(2), td:nth-child(3) { color: #666; white-space: nowrap; }
</style></head><body>
<h1>Capturas — /${escaparHtml(relDir)}</h1>
<table><tr><th>Nombre</th><th>Tamaño</th><th>Modificado</th></tr>
${filas}
</table></body></html>`;
}

async function listarDirectorio(root, relDir) {
  const abs = path.resolve(root, relDir);
  const nombres = await readdir(abs);
  const entradas = [];
  for (const nombre of nombres) {
    const info = await stat(path.resolve(abs, nombre));
    entradas.push({ nombre, esDir: info.isDirectory(), bytes: info.size, fecha: info.mtime });
  }
  // Folders first, then newest files first.
  entradas.sort((a, b) => (b.esDir - a.esDir) || (b.fecha - a.fecha));
  return paginaListado(root, relDir, entradas);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ayuda) {
    printHelp();
    return 0;
  }
  validateArgs(args);

  const root = path.resolve(process.cwd(), args.directorio);

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const urlPath = new URL(req.url ?? '/', 'http://local').pathname;
      const abs = resolverRutaSegura(root, urlPath);
      if (abs === null) {
        res.writeHead(403).end('Prohibido');
        return;
      }
      let info;
      try {
        info = await stat(abs);
      } catch {
        res.writeHead(404).end('No encontrado');
        return;
      }
      if (info.isDirectory()) {
        const relDir = path.relative(root, abs).split(path.sep).join('/');
        const html = await listarDirectorio(root, relDir);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : html);
        return;
      }
      const ext = path.extname(abs).toLowerCase();
      const mime = MIME[ext] ?? 'application/octet-stream';
      const contenido = await readFile(abs);
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': info.size });
      res.end(req.method === 'HEAD' ? undefined : contenido);
    } catch (error) {
      console.error(`[capturas-servir] error atendiendo ${req.url}: ${error.message}`);
      if (!res.headersSent) res.writeHead(500).end('Error interno');
      else res.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.puerto, args.host, resolve);
  });
  console.log(`[capturas-servir] sirviendo "${root}" en http://${args.host}:${args.puerto}/`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  const code = error.code ?? '';
  if (code === 'EADDRINUSE') {
    console.error(`Error: el puerto ya está en uso — ¿hay otro capturas-servir corriendo? (${error.message})`);
  } else {
    console.error(`Error: ${error.message}`);
  }
  process.exitCode = 1;
}
