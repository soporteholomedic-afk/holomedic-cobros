#!/usr/bin/env node
// Mini servidor local: escribe texto en el navegador y lo guarda como .txt en docs/subidos/
// Uso: node docs/servidor-texto.mjs [puerto]   (puerto por defecto: 3456)
// Sin dependencias: Node puro (http + fs).
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = dirname(fileURLToPath(import.meta.url));
const DESTINO = join(DOCS, 'subidos');
const PUERTO = Number(process.argv[2]) || 3456;
const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB

mkdirSync(DESTINO, { recursive: true });

const PAGINA = (mensaje) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Subir texto</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.4rem; }
  input, textarea { width: 100%; box-sizing: border-box; margin: 8px 0; padding: 8px; font: inherit; }
  textarea { height: 320px; resize: vertical; }
  button { padding: 8px 24px; font: inherit; cursor: pointer; }
  .ok { color: #0a7d32; }
</style>
</head>
<body>
<h1>Guardar texto en <code>docs/subidos</code></h1>
${mensaje ? `<p class="ok">${mensaje}</p>` : ''}
<form method="POST" action="/guardar">
  <input name="titulo" placeholder="Título del archivo (opcional)">
  <textarea name="texto" placeholder="Escribí o pegá tu texto acá..." required></textarea>
  <button type="submit">Guardar como .txt</button>
</form>
</body>
</html>`;

function nombreSeguro(titulo) {
  const base = (titulo || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos para el nombre de archivo
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${sello}${base ? '-' + base : ''}.txt`;
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    const ok = new URL(req.url, 'http://local').searchParams.get('ok');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA(ok ? `Guardado como <code>${ok.replace(/[<>&"]/g, '')}</code>` : ''));
    return;
  }

  if (req.method === 'POST' && req.url === '/guardar') {
    let cuerpo = '';
    req.on('data', (trozo) => {
      cuerpo += trozo;
      if (cuerpo.length > LIMITE_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        const datos = new URLSearchParams(cuerpo);
        const texto = datos.get('texto') ?? '';
        if (!texto.trim()) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('El texto está vacío.');
          return;
        }
        const archivo = nombreSeguro(datos.get('titulo'));
        writeFileSync(join(DESTINO, archivo), texto, 'utf8');
        res.writeHead(303, { Location: `/?ok=${encodeURIComponent(archivo)}` });
        res.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error al guardar: ' + err.message);
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
});

server.listen(PUERTO, '0.0.0.0', () => {
  console.log(`Servidor de texto en http://localhost:${PUERTO} — guarda en ${DESTINO}`);
});
