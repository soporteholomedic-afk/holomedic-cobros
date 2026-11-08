#!/usr/bin/env node
// capturas.mjs — Batch screenshot tool backed by Playwright (Chromium headless).
//
// Usage:
//   node scripts/capturas.mjs <url> [<url> ...] [opciones]
//   node scripts/capturas.mjs --desde urls.txt [opciones]
//
// Options:
//   --desde <archivo>     Read URLs from a text file (one per line, `#` comments).
//   --salida <dir>        Output directory (default: capturas)
//   --ancho <n>           Viewport width (default: 1440)
//   --alto <n>            Viewport height (default: 900)
//   --pagina-completa     Full-page screenshot instead of viewport only
//   --concurrencia <n>    Parallel captures (default: 2 — RAM-safe, this box has no swap)
//   --timeout-ms <n>      Navigation timeout per URL (default: 30000)
//   --enviar-a <correo>   Send captures as email attachments via the facturacion SMTP account
//   --ayuda               Show this help

import { mkdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';
import { chromium } from 'playwright';

const DEFAULTS = {
  salida: 'capturas',
  ancho: 1440,
  alto: 900,
  concurrencia: 2,
  timeoutMs: 30_000,
  settleMs: 500,
};

function printHelp() {
  const help = `capturas — capturas de pantalla por lote con Playwright (Chromium headless)

Uso:
  node scripts/capturas.mjs <url> [<url> ...] [opciones]
  node scripts/capturas.mjs --desde urls.txt [opciones]

Opciones:
  --desde <archivo>     Lee URLs de un archivo de texto (una por línea, '#' = comentario)
  --salida <dir>        Directorio de salida (por defecto: capturas)
  --ancho <n>           Ancho del viewport (por defecto: 1440)
  --alto <n>            Alto del viewport (por defecto: 900)
  --pagina-completa     Captura la página completa en vez de solo el viewport
  --concurrencia <n>    Capturas en paralelo (por defecto: 2; el equipo no tiene swap)
  --timeout-ms <n>      Timeout de navegación por URL (por defecto: 30000)
  --enviar-a <correo>   Envía las capturas adjuntas por correo (cuenta SMTP de facturación).
                        Admite varias separadas por coma: a@x.com,b@y.com
  --ayuda               Muestra esta ayuda

Ejemplos:
  node scripts/capturas.mjs http://localhost:3001/auth/login
  node scripts/cobros.mjs --pagina-completa --concurrencia 3 --desde rutas.txt
`;
  console.log(help);
}

function parseArgs(argv) {
  const args = { ...DEFAULTS, paginacompleta: false, urls: [], desde: null, ayuda: false, enviarA: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`La opción ${arg} requiere un valor.`);
      return argv[i];
    };
    switch (arg) {
      case '--desde': args.desde = next(); break;
      case '--salida': args.salida = next(); break;
      case '--ancho': args.ancho = Number.parseInt(next(), 10); break;
      case '--alto': args.alto = Number.parseInt(next(), 10); break;
      case '--concurrencia': args.concurrencia = Number.parseInt(next(), 10); break;
      case '--timeout-ms': args.timeoutMs = Number.parseInt(next(), 10); break;
      case '--enviar-a': args.enviarA = next(); break;
      case '--pagina-completa': args.paginacompleta = true; break;
      case '--ayuda': case '--help': case '-h': args.ayuda = true; break;
      default:
        if (arg.startsWith('-')) throw new Error(`Opción desconocida: ${arg}`);
        args.urls.push(arg);
    }
  }
  return args;
}

function validateArgs(args) {
  if (!Number.isFinite(args.ancho) || args.ancho <= 0) throw new Error(`--ancho inválido: ${args.ancho}`);
  if (!Number.isFinite(args.alto) || args.alto <= 0) throw new Error(`--alto inválido: ${args.alto}`);
  if (!Number.isFinite(args.concurrencia) || args.concurrencia < 1 || args.concurrencia > 6) {
    throw new Error(`--concurrencia inválida: ${args.concurrencia} (admite 1..6; sin swap conviene ≤ 3)`);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error(`--timeout-ms inválido: ${args.timeoutMs}`);
}

function parseDestinatarios(valor) {
  const correos = valor
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const invalidos = correos.filter((c) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
  if (correos.length === 0 || invalidos.length > 0) {
    throw new Error(`--enviar-a inválido: "${valor}" (esperado: correo@dominio[,correo2@dominio])`);
  }
  return correos;
}

/** Parse KEY=VALUE lines of .env.local into process.env (never overwrite).
 *  Same pattern as scripts/crm-normalizar-datos.mjs. */
function cargarEnvLocal() {
  const ruta = path.resolve(process.cwd(), '.env.local');
  let contenido;
  try {
    contenido = readFileSync(ruta, 'utf8');
  } catch {
    throw new Error(`No se pudo leer ${ruta} — ejecute desde la raíz del repo.`);
  }
  for (const linea of contenido.split(/\r?\n/)) {
    const coincide = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linea.trim());
    if (coincide && process.env[coincide[1]] === undefined) {
      process.env[coincide[1]] = coincide[2];
    }
  }
}

/** Send capture files as one email via the facturacion SMTP account
 *  (SMTP_USER_FACTURACION / SMTP_PASS_FACTURACION, shared SMTP_HOST/PORT).
 *  Mirrors src/utils/sendEmail.ts: secure only on port 465, from = SMTP user.
 *  Never logs the password. Returns the messageId on success. */
async function enviarCapturas(correos, archivos) {
  cargarEnvLocal();
  const host = process.env.SMTP_HOST;
  const puerto = Number.parseInt(process.env.SMTP_PORT ?? '', 10);
  const usuario = process.env.SMTP_USER_FACTURACION;
  const password = process.env.SMTP_PASS_FACTURACION;
  const faltantes = [
    ['SMTP_HOST', host],
    ['SMTP_PORT', process.env.SMTP_PORT],
    ['SMTP_USER_FACTURACION', usuario],
    ['SMTP_PASS_FACTURACION', password],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (faltantes.length > 0) {
    throw new Error(`SMTP no configurado (facturación): faltan ${faltantes.join(', ')} en .env.local`);
  }

  const transporte = nodemailer.createTransport({
    host,
    port: puerto,
    secure: puerto === 465,
    auth: { user: usuario, pass: password },
    connectionTimeout: 10_000,
  });

  const info = await transporte.sendMail({
    from: usuario,
    to: correos,
    subject: `Capturas de pantalla — ${archivos.length} captura(s) — ${timestamp()}`,
    text: `Adjunto ${archivos.length} captura(s) generada(s) con scripts/capturas.mjs.`,
    html: `<p>Adjunto <strong>${archivos.length}</strong> captura(s) generada(s) con <code>scripts/capturas.mjs</code>.</p>`,
    attachments: archivos.map((archivo) => ({
      filename: path.basename(archivo),
      path: archivo,
      contentType: 'image/png',
    })),
  });
  return info.messageId;
}

async function readUrlsFromFile(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`No se pudo leer --desde "${filePath}": ${error.message}`);
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function slugify(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'captura';
  }
  const parts = [
    parsed.hostname,
    ...parsed.pathname.split('/').filter(Boolean),
  ].join('-');
  const slug = parts
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length > 0 ? slug : 'captura';
}

function timestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function navigate(page, url, timeoutMs) {
  await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  // Best-effort quiet-network wait; long-polling pages must not break the capture.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(DEFAULTS.settleMs);
}

async function captureOne(browser, { url, args }) {
  const context = await browser.newContext({
    viewport: { width: args.ancho, height: args.alto },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await navigate(page, url, args.timeoutMs);
    const file = path.join(args.salida, `${slugify(url)}_${timestamp()}.png`);
    await page.screenshot({ path: file, fullPage: args.paginacompleta });
    return { url, ok: true, file };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runPool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, size), items.length) }, lane),
  );
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ayuda) {
    printHelp();
    return 0;
  }
  validateArgs(args);
  const correos = args.enviarA ? parseDestinatarios(args.enviarA) : null;

  if (args.desde) {
    args.urls.push(...(await readUrlsFromFile(args.desde)));
  }
  const urls = [...new Set(args.urls)];
  if (urls.length === 0) {
    printHelp();
    throw new Error('No se recibió ninguna URL (posicional o vía --desde).');
  }

  await mkdir(args.salida, { recursive: true });

  console.log(`Chromium headless — ${urls.length} URL(s), concurrencia ${args.concurrencia}, salida "${args.salida}"`);
  const browser = await chromium.launch({ headless: true });
  try {
    const results = await runPool(urls, args.concurrencia, (url) =>
      captureOne(browser, { url, args }).catch((error) => ({
        url,
        ok: false,
        error: error.message.split('\n')[0],
      })),
    );

    let okCount = 0;
    for (const r of results) {
      if (r.ok) {
        okCount += 1;
        console.log(`[ok]   ${r.url} -> ${r.file}`);
      } else {
        console.error(`[fallo] ${r.url} -> ${r.error}`);
      }
    }
    console.log(`${okCount}/${results.length} capturas generadas en "${args.salida}".`);
    if (correos) {
      const archivosOk = results.filter((r) => r.ok).map((r) => r.file);
      if (archivosOk.length === 0) {
        console.error('No hay capturas exitosas para enviar; no se envía correo.');
        return 1;
      }
      const messageId = await enviarCapturas(correos, archivosOk);
      console.log(`Correo enviado a ${correos.join(', ')} (MessageId: ${messageId}).`);
    }
    return okCount === results.length ? 0 : 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
