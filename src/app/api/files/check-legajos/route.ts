import { NextResponse } from 'next/server';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';

interface CheckLegajosItem {
  ruc: string;
  dni: string;
  idAten: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CheckLegajosItem[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Payload must be an array' },
      { status: 400 }
    );
  }

  for (const item of body) {
    if (!item || typeof item !== 'object') {
      return NextResponse.json(
        { error: 'Cada elemento del payload debe ser un objeto.' },
        { status: 400 }
      );
    }
    const ruc = item.ruc?.trim() ?? '';
    const dni = item.dni?.trim() ?? '';
    const idAten = item.idAten?.trim() ?? '';

    if (!ruc || !dni || !idAten) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos (ruc, dni, idAten).' },
        { status: 400 }
      );
    }

    if (!/^\d+$/.test(dni)) {
      return NextResponse.json(
        { error: 'dni debe ser numérico.' },
        { status: 400 }
      );
    }
  }

  const results: Record<string, { hasCamo: boolean; hasEmo: boolean; error?: string }> = {};

  const checkPromises = body.map(async (item) => {
    const ruc = item.ruc.trim();
    const dni = item.dni.trim();
    const idAten = item.idAten.trim();

    try {
      const nodes = await getFileRepository().listFolder(ruc, dni, idAten, 'LEGAJOS');
      
      let hasCamo = false;
      let hasEmo = false;

      const camoRegex = /^\d+CERT\.pdf$/i;
      const emoRegex = /^\d+EXPED\.pdf$/i;

      for (const node of nodes) {
        if (node.kind === 'file') {
          if (camoRegex.test(node.name)) {
            hasCamo = true;
          }
          if (emoRegex.test(node.name)) {
            hasEmo = true;
          }
        }
      }

      results[idAten] = { hasCamo, hasEmo };
    } catch (err) {
      results[idAten] = {
        hasCamo: false,
        hasEmo: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  await Promise.all(checkPromises);

  return NextResponse.json(results);
}
