#!/usr/bin/env node
/**
 * Dev-only LLM harness (agente-ia-crm) — auto-syncs the GLM API key from
 * the operator's existing agent harness configs so `pnpm dev` runs la
 * Guía on the REAL LLM without duplicating secrets into this repo.
 *
 * How it works (every `pnpm dev` start, via the `predev` hook):
 *   1. If `.env.local` carries an explicit LLM_API_KEY, it wins — exit
 *      without touching anything (manual override beats the harness).
 *   2. Probe the harness candidates IN ORDER with a tiny (8-token)
 *      completion and pick the FIRST one that answers 200:
 *        - Gentle-Shell  ~/.gentle-shell/agent/auth.json  "zai"
 *            → https://api.z.ai/api/paas/v4/
 *        - Opencode      ~/.local/share/opencode/auth.json "zai-coding-plan"
 *            → https://api.z.ai/api/paas/v4/
 *        - Opencode      ~/.local/share/opencode/auth.json "zhipuai-coding-plan"
 *            → https://open.bigmodel.cn/api/paas/v4/
 *      Keys with no balance (HTTP 429 / error 1113) are skipped — the
 *      harness becomes live the moment the plan is recharged.
 *   3. Write the winner to `.env.development.local` (Next.js loads it
 *      ONLY under `next dev`; production keeps the fail-closed path).
 *      This file is owned entirely by the script — do not hand-edit it.
 *   4. No working candidate → remove the managed file so the
 *      deterministic simulator keeps attending development.
 *
 * The script NEVER prints a key (masked ids only) and NEVER blocks the
 * dev server: it always exits 0, failures degrade to a console notice.
 */
import { access, readFile, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.cwd();
const ENV_LOCAL = path.join(REPO, '.env.local');
const ENV_DEV_LOCAL = path.join(REPO, '.env.development.local');
const MANAGED_HEADER =
  '# Managed by scripts/dev-arnes-llm.mjs — dev-only LLM harness. Do not edit.';
const PROBE_MODEL = 'glm-5.3-flash';
const PROBE_TIMEOUT_MS = 20_000;

const CANDIDATES = [
  {
    label: 'gentle-shell/zai',
    file: path.join(os.homedir(), '.gentle-shell/agent', 'auth.json'),
    provider: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4/',
  },
  {
    label: 'opencode/zai-coding-plan',
    file: path.join(os.homedir(), '.local/share/opencode', 'auth.json'),
    provider: 'zai-coding-plan',
    baseUrl: 'https://api.z.ai/api/paas/v4/',
  },
  {
    label: 'opencode/zhipuai-coding-plan',
    file: path.join(os.homedir(), '.local/share/opencode', 'auth.json'),
    provider: 'zhipuai-coding-plan',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
  },
];

const mask = (k) => (k ? `${k.slice(0, 5)}***${k.slice(-3)}` : '(none)');

async function readEnvLocalKey() {
  try {
    const text = await readFile(ENV_LOCAL, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^LLM_API_KEY\s*=\s*(.+)$/.exec(line.trim());
      if (m && !line.trim().startsWith('#')) return m[1].trim();
    }
    return null;
  } catch {
    return null;
  }
}

async function readHarnessKey(file, provider) {
  try {
    const auth = JSON.parse(await readFile(file, 'utf8'));
    const entry = auth?.[provider];
    const key = entry?.key ?? entry?.apiKey;
    return typeof key === 'string' && key.length >= 20 ? key : null;
  } catch {
    return null;
  }
}

async function probe(key, baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const respuesta = await fetch(new URL('chat/completions', baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PROBE_MODEL,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 8,
      }),
    });
    // 200 = live key; anything else (429 balance, 401, …) = not usable now.
    return respuesta.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const explicit = await readEnvLocalKey();
  if (explicit) {
    console.log(
      `[arnes-llm] .env.local ya define LLM_API_KEY (${mask(explicit)}) — arnés respetado, sin cambios.`,
    );
    return;
  }

  for (const cand of CANDIDATES) {
    const key = await readHarnessKey(cand.file, cand.provider);
    if (!key) {
      console.log(`[arnes-llm] ${cand.label}: sin key configurada — skip.`);
      continue;
    }
    const vivo = await probe(key, cand.baseUrl);
    if (!vivo) {
      console.log(
        `[arnes-llm] ${cand.label} (${mask(key)}): sin saldo o no responde — skip.`,
      );
      continue;
    }
    const contenido = [
      MANAGED_HEADER,
      `LLM_API_KEY=${key}`,
      `LLM_BASE_URL=${cand.baseUrl}`,
      `LLM_MODELO=${PROBE_MODEL}`,
      '',
    ].join('\n');
    await writeFile(ENV_DEV_LOCAL, contenido, { mode: 0o600 });
    console.log(
      `[arnes-llm] GLM REAL activo para dev vía ${cand.label} (${mask(key)}) → .env.development.local`,
    );
    return;
  }

  // Ninguna key viva: retirar el archivo administrado para que el
  // generador simulado siga atendiendo (fail-safe de desarrollo).
  try {
    await access(ENV_DEV_LOCAL, constants.F_OK);
    await rm(ENV_DEV_LOCAL);
    console.log(
      '[arnes-llm] sin keys con saldo — .env.development.local retirado; la Guía atiende con el generador SIMULADO.',
    );
  } catch {
    console.log(
      '[arnes-llm] sin keys con saldo — la Guía atiende con el generador SIMULADO.',
    );
  }
  console.log(
    '[arnes-llm] recargá el plan Z.ai/Zhipu y la próxima corrida de `pnpm dev` pasa a GLM real sola.',
  );
}

main().catch((error) => {
  // El arnés jamás bloquea el arranque de dev.
  console.warn('[arnes-llm] error inesperado (dev sigue):', error?.message);
});
