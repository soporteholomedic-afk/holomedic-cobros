import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import type { PDFFont, PDFForm } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  buildGetAtencionDetalle,
  buildLoadJjcEvaluacion,
} from '@/features/jjc-mapper/composition/container';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { mapAtencionToPdfFields } from './mapAtencionToPdfFields';
import { drawLesionMarkers } from './drawLesionMarkers';

const TAHOMA_FONT_PATH = path.resolve(
  process.cwd(),
  'public',
  'Tahoma Regular font.ttf',
);

const PDF_FIELD_FONT_SIZE = 8;

async function loadAndEmbedTahomaFont(
  pdfDoc: PDFDocument,
): Promise<PDFFont | undefined> {
  pdfDoc.registerFontkit(fontkit);
  try {
    const fontBytes = fs.readFileSync(TAHOMA_FONT_PATH);
    return await pdfDoc.embedFont(fontBytes);
  } catch (err) {
    console.warn('[api/jjc/pdf] Could not load Tahoma font, using default', {
      err,
    });
    return undefined;
  }
}

interface ImgSlot {
  name: string;
  path: string | null;
  /** In-memory image buffer (for DB-sourced images like doctor signature). */
  buffer?: Buffer | null;
  /** Saved widget rectangle — read before flatten. */
  rect?: { x: number; y: number; width: number; height: number };
  /** Page index where this widget lives (0-based). */
  pageIndex?: number;
}

/**
 * Read image paths from `atencion` (plus optional medico firma buffer), capture
 * their widget positions from the PDF acroform BEFORE flatten, then draw the
 * images onto the page content AFTER flatten so no generated button appearance
 * covers them.
 *
 * Absent paths, missing widgets, and read failures are all swallowed — the
 * PDF is generated without the image.
 */
export async function embedPatientImages(
  pdfDoc: PDFDocument,
  form: PDFForm,
  rutaFirma: string | null,
  rutaHuella: string | null,
  medicoFirmaBuffer?: Buffer | null,
): Promise<void> {
  const slots: ImgSlot[] = [
    { name: 'img_firma', path: rutaFirma },
    { name: 'img_huella', path: rutaHuella },
    { name: 'img_firma_medico', path: null, buffer: medicoFirmaBuffer ?? null },
  ];

  // Build page-ref → page-index map so we can resolve widget.P() to an index
  const pages = pdfDoc.getPages();
  const pageRefToIndex = new Map<string, number>();
  for (let i = 0; i < pages.length; i++) {
    pageRefToIndex.set(pages[i].ref.toString(), i);
  }

  for (const slot of slots) {
    if (!slot.path && !slot.buffer) continue;
    try {
      const button = form.getButton(slot.name);
      const widget = button.acroField.getWidgets()[0];
      slot.rect = widget.getRectangle();
      const widgetPageRef = widget.P();
      if (widgetPageRef) {
        slot.pageIndex = pageRefToIndex.get(widgetPageRef.toString());
      }
    } catch {
      // Button doesn't exist in this template — skip silently
    }
  }

  // Flatten form (removes all widget annotations & generates appearances)
  form.flatten();

  // Now draw images over the flattened page — no widget annotation can cover them
  for (const slot of slots) {
    if (!slot.rect || slot.pageIndex === undefined) continue;
    try {
      let img;
      if (slot.buffer) {
        // DB-sourced image (PNG from usuario.firma)
        try {
          img = await pdfDoc.embedPng(new Uint8Array(slot.buffer));
        } catch {
          img = await pdfDoc.embedJpg(new Uint8Array(slot.buffer));
        }
      } else if (slot.path) {
        const bytes = new Uint8Array(fs.readFileSync(slot.path));
        img = await pdfDoc.embedJpg(bytes);
      } else {
        continue;
      }

      const { width: slotW, height: slotH } = slot.rect;
      const imgW = img.width;
      const imgH = img.height;

      // Scale proportionally to fit within the widget rect
      const scale = Math.min(slotW / imgW, slotH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;

      // Center horizontally within the slot; bottom-align vertically
      const drawX = slot.rect.x + (slotW - drawW) / 2;
      const drawY = slot.rect.y + (slotH - drawH);

      pdfDoc.getPage(slot.pageIndex).drawImage(img, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });
    } catch {
      // File not found or unreadable — skip silently
    }
  }
}

/**
 * GET /api/areas/medicina/jjc/[idAten]/pdf
 *
 * Generates a filled PDF for a JJC attention by composing the attention detail
 * (required) with the optional JJC evaluation data. The PDF template is loaded
 * from `public/PLANTILLA_JJC_MEDICINA.pdf`.
 *
 * Status codes:
 * - 200: PDF generated and streamed with `Content-Disposition: attachment`
 * - 404: Atencion not found
 * - 502: SIGLA database unreachable
 * - 500: Other internal errors
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ idAten: string }> },
): Promise<NextResponse> {
  const { idAten } = await params;

  try {
    // 1. Fetch attention detail (required)
    let atencion;
    try {
      const atencionUseCase = buildGetAtencionDetalle();
      atencion = await atencionUseCase.execute(idAten);
    } catch (err) {
      console.warn('[api/jjc/pdf] atencion fetch error', { idAten, err });
      return NextResponse.json(
        { error: 'database_unavailable' },
        { status: 502 },
      );
    }

    if (!atencion) {
      return NextResponse.json(
        { error: 'atencion_not_found' },
        { status: 404 },
      );
    }

    // 2. Fetch evaluation (optional — failure is non-blocking)
    let evaluacion = null;
    try {
      const evaluacionUseCase = buildLoadJjcEvaluacion();
      const evalResult = await evaluacionUseCase.execute(idAten);
      if (evalResult.ok) {
        evaluacion = evalResult.data;
      }
    } catch {
      // Evaluation is optional — don't block the PDF
    }

    // 3. Map fields
    const fieldMap = mapAtencionToPdfFields(atencion, evaluacion);

    // 4. Load and fill the PDF template
    const templatePath = path.resolve(process.cwd(), 'public', 'PLANTILLA_JJC_MEDICINA.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    const tahomaFont = await loadAndEmbedTahomaFont(pdfDoc);

    // Draw lesion markers on the face image area (page 0 — first page)
    if (evaluacion?.lesiones && evaluacion.lesiones.length > 0) {
      const page = pdfDoc.getPage(0);
      drawLesionMarkers({ page, points: evaluacion.lesiones, font: tahomaFont });
    }

    // Fill text fields
    for (const [fieldName, value] of Object.entries(fieldMap.text)) {
      try {
        const field = form.getTextField(fieldName);
        const textValue = (value ?? '').toUpperCase();
        field.setText(textValue);
        if (tahomaFont) {
          field.setFontSize(PDF_FIELD_FONT_SIZE);
          field.updateAppearances(tahomaFont);
        }
      } catch {
        // Field might not exist in template — skip gracefully
      }
    }

    // Fill checkboxes
    for (const [fieldName, checked] of Object.entries(fieldMap.checks)) {
      try {
        const field = form.getCheckBox(fieldName);
        if (checked) {
          field.check();
        } else {
          field.uncheck();
        }
      } catch {
        // Field might not exist in template — skip gracefully
      }
    }

    // Fill chunked text fields (Observaciones 1/2/3, Describa...positiva 1/2)
    for (const [prefix, values] of Object.entries(fieldMap.chunks)) {
      for (let i = 0; i < values.length; i++) {
        try {
          const fieldName = `${prefix} ${i + 1}`;
          const field = form.getTextField(fieldName);
          const textValue = values[i].toUpperCase();
          field.setText(textValue);
          if (tahomaFont) {
            field.setFontSize(PDF_FIELD_FONT_SIZE);
            field.updateAppearances(tahomaFont);
          }
        } catch {
          // Field might not exist — skip gracefully
        }
      }
    }

    // 5. Look up medico signature from DB (if evaluation was created by someone)
    let medicoFirmaBuf: Buffer | null = null;
    if (evaluacion?.createdBy) {
      try {
        const usuarioRepo = await getUsuarioDb();
        medicoFirmaBuf = await usuarioRepo.getFirma(evaluacion.createdBy);
      } catch {
        // Medico signature not found — skip gracefully
      }
    }

    // 6. Embed patient signature, fingerprint, and medico signature images
    //    (captures rects, flattens, then draws — so no generated button
    //    appearance covers them)
    await embedPatientImages(
      pdfDoc,
      form,
      atencion.rutaFirma,
      atencion.rutaHuella,
      medicoFirmaBuf,
    );
    // (form.flatten() is now called inside embedPatientImages)

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="jjc-${idAten}.pdf"`,
      },
    });
  } catch (err) {
    console.warn('[api/jjc/pdf] internal error', { idAten, err });
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500 },
    );
  }
}
