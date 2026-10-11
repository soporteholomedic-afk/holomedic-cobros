/**
 * `pnpm guia` — terminal chat with la Guía (agente-ia-crm, DEV ONLY).
 *
 * The opencode-run-style one-shot: write a message, la Guía answers in
 * the terminal through the REAL pipeline (normalización → vinculación →
 * CRM_AgenteTareas → motor con KB+memoria Engram → respuesta auditada).
 *
 * Usage:
 *   pnpm guia "¿qué servicios ofrecen?"            chat del número CLI
 *   pnpm guia --tel "099 111 222" "hola"           otro hilo (otro teléfono)
 *   pnpm guia --indicacion "decí que sí a 30 días"  aplica la indicación a la
 *                                                  solicitud pendiente y muestra
 *                                                  la respuesta retomada
 *   pnpm guia --ficha                               ficha viva del hilo CLI
 *
 * Dev conveniences (never in prod): loads `.env.development.local` then
 * `.env.local` (never overwriting real env), and defaults the agent
 * window to 0–23 so the CLI works at night. The generator is REAL GLM
 * while the harness key has balance, deterministic simulator otherwise
 * (the respuesta line shows which modelo answered). Conversations are
 * REAL rows in the dev DB — the default CLI number keeps continuity
 * like any WhatsApp thread; pass --tel for throwaway probes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const TELEFONO_CLI = '+598 99 000 011';

// ---------- args ----------
function parsearArgs(argv: string[]) {
  const salida: { telefono?: string; indicacion?: string; ficha: boolean; mensaje?: string } = {
    ficha: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--tel' || a === '--telefono') salida.telefono = argv[++i];
    else if (a === '--indicacion') salida.indicacion = argv[++i];
    else if (a === '--ficha') salida.ficha = true;
    else if (!a.startsWith('--') && salida.mensaje === undefined) salida.mensaje = a;
  }
  return salida;
}

// ---------- env (dev-only conveniences, nunca pisan vars reales) ----------
function cargarEnvArchivo(ruta: string) {
  try {
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const l = linea.trim();
      if (!l || l.startsWith('#')) continue;
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.trim();
    }
  } catch {
    /* archivo ausente — ok */
  }
}
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
cargarEnvArchivo(path.join(RAIZ, '.env.development.local')); // arnés LLM primero
cargarEnvArchivo(path.join(RAIZ, '.env.local'));
process.env.AGENTE_HORARIO_DESDE ??= '0'; // ventana amplia solo para este CLI
process.env.AGENTE_HORARIO_HASTA ??= '23';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  const telefono = args.telefono ?? TELEFONO_CLI;

  // Importación dinámica DESPUÉS de cargar env (los adapters leen process.env).
  const { getCrmDb } = await import('@/features/crm/infrastructure/getCrmDb');
  const { ProcesarMensajeWhatsappUseCase } = await import(
    '@/features/crm/application/procesarMensajeWhatsapp'
  );
  const { SimularMensajeEntranteUseCase } = await import(
    '@/features/crm/application/simularMensajeEntrante'
  );
  const { crearProcesadorTareasAgente } = await import(
    '@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente'
  );
  const { normalizarTelefonoE164 } = await import('@/features/crm/domain/normalizar');
  const { AplicarIndicacionUseCase } = await import('@/features/crm/application/aplicarIndicacion');
  const { crearMemoriaConversacion } = await import(
    '@/features/crm/infrastructure/engram/crearMemoriaConversacion'
  );
  const { ObtenerFichaConversacionUseCase } = await import(
    '@/features/crm/application/obtenerFichaConversacion'
  );

  const db = await getCrmDb();
  if (!db.conversaciones || !db.mensajes) throw new Error('CRM no configurado (faltan repos)');

  // Resolver el hilo del teléfono (existente o el que cree el mensaje).
  const e164 = normalizarTelefonoE164(telefono);
  if (e164 === null) throw new Error(`Teléfono inválido: ${telefono}`);
  let conversacion =
    (await db.conversaciones.buscarPorCanal('WHATSAPP', { telefono: e164 })) ?? null;

  // 1) Mensaje nuevo → circuito completo (simulador de entrada).
  if (args.mensaje !== undefined) {
    const simular = new SimularMensajeEntranteUseCase({
      procesar: new ProcesarMensajeWhatsappUseCase({
        conversaciones: db.conversaciones,
        mensajes: db.mensajes,
        tareas: db.tareas,
      }),
    });
    const r = await simular.ejecutar({ telefono, texto: args.mensaje });
    if (r.conversacionId === null) throw new Error('No se pudo registrar el mensaje');
    conversacion = (await db.conversaciones.obtenerPorId(r.conversacionId)) ?? conversacion;
    console.log(dim(`→ enviado (${r.conversacionId})${r.vinculado ? '' : ' · sin vincular'}`));
  }

  if (!conversacion) {
    console.log(dim(`Sin conversación para ${telefono}. Mandale un mensaje primero:`));
    console.log(dim(`  pnpm guia --tel "${telefono}" "hola"`));
    return;
  }
  const idConversacion = conversacion.id;

  // 2) Indicación (E3): aplicar y reanudar.
  if (args.indicacion !== undefined) {
    if (!db.conocimiento || !db.tareas) {
      throw new Error('La indicación requiere los repos conocimiento/tareas (getCrmDb no los proveyó)');
    }
    const aplicar = new AplicarIndicacionUseCase({
      conversaciones: db.conversaciones,
      conocimiento: db.conocimiento,
      memoria: crearMemoriaConversacion(),
      tareas: db.tareas,
      mensajes: db.mensajes,
    });
    const r = await aplicar.ejecutar({
      conversacionId: idConversacion,
      indicacion: args.indicacion,
      usuarioId: 'cli',
      usuarioNombre: 'CLI',
    });
    console.log(
      dim(
        `✓ indicación guardada (solicitud #${r.solicitud.id}) · memoria ${r.memoria.guardada ? 'pineada' : 'no (best-effort)'} · hueco #${r.hueco.id}`,
      ),
    );
  }

  // 3) Drenar la cola (motor real: KB + memoria + guardrails).
  const drenaje = await crearProcesadorTareasAgente().procesar();
  if (drenaje.procesadas > 0 || args.mensaje !== undefined || args.indicacion !== undefined) {
    console.log(dim(`🤖 trabajó (${drenaje.procesadas} tarea/s, ${drenaje.resultados?.length ?? 0} resp.)`));
  }

  // 4) Ficha (E3) si la piden.
  if (args.ficha) {
    if (!db.conversaciones || !db.empresas) throw new Error('CRM no configurado (ficha)');
    const ficha = await new ObtenerFichaConversacionUseCase({
      conversaciones: db.conversaciones,
      empresas: db.empresas,
    }).ejecutar(idConversacion);
    console.log(bold('\n📇 Ficha del contacto'));
    console.log(`  contacto: ${ficha.contacto?.nombre ?? '—'} · empresa: ${ficha.empresa?.razonSocial ?? '—'}`);
    for (const [campo, dato] of Object.entries(ficha.datos)) {
      const tag = dato.origen === 'IA' ? ' 🤖' : dato.origen === 'canonico' ? '' : '';
      console.log(`  ${campo}: ${dato.valor ?? '— por detectar —'}${tag}${dato.confirmado ? ' ✓' : ''}`);
    }
  }

  // 5) Última palabra de la Guía + estado + auditoría.
  const actual = (await db.conversaciones.obtenerPorId(idConversacion)) ?? conversacion;
  const ultimos = await db.mensajes.listarPorConversacion(idConversacion, { limite: 10 });
  const respuestaIa = ultimos.find((m) => m.emisor === 'IA');
  console.log(bold('\n🤖 La Guía:'));
  if (respuestaIa) {
    console.log(`  ${respuestaIa.cuerpo}`);
    const fuentes = respuestaIa.fuentes ? JSON.parse(respuestaIa.fuentes) : null;
    const lista =
      fuentes && Array.isArray(fuentes)
        ? fuentes.map((f: unknown) => (typeof f === 'string' ? f : (f as { titulo?: string }).titulo ?? ''))
        : [];
    console.log(
      dim(
        `   · modelo ${respuestaIa.modelo ?? '?'} · score ${respuestaIa.score ?? '?'}${
          lista.length ? ` · fuentes: ${lista.join(', ')}` : ''
        }`,
      ),
    );
  } else {
    console.log(dim('   (sin respuesta aún — revisá guardrails/horario/kill switch)'));
  }
  console.log(dim(`   estado: ${actual.estado} · asignada: ${actual.asignadaA ?? '—'} · hilo #${idConversacion}`));

  // 6) Si pidió ayuda, mostrar la solicitud (E3).
  if (actual.estado === 'REQUIERE_HUMANO' && db.conversaciones.obtenerSolicitudAyudaPendiente) {
    const solicitud = await db.conversaciones.obtenerSolicitudAyudaPendiente(idConversacion);
    if (solicitud) {
      console.log(bold(`\n⚠ La Guía pregunta: ¿cómo sigo? (solicitud #${solicitud.id})`));
      console.log(`  preguntaron: ${solicitud.consulta}`);
      console.log(`  buscó: ${solicitud.terminosBuscados.join(', ') || '—'} · score ${solicitud.score ?? '?'}`);
      console.log(dim('  respondé desde la terminal:'));
      console.log(dim(`  pnpm guia --tel "${telefono}" --indicacion "tu indicación…"`));
    }
  }
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error(`\n✖ ${mensaje}`);
  if (process.env.GUIA_DEBUG || !(error instanceof Error)) {
    console.error(error instanceof Error ? error.stack : error);
  }
  if (mensaje.includes('KAPSO') || mensaje.includes('Simulación')) {
    console.error(dim('  (el simulador exige KAPSO_MODO != real — revisá .env.local)'));
  }
  process.exitCode = 1;
});
