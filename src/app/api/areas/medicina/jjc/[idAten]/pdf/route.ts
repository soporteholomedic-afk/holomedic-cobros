import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  buildGetAtencionDetalle,
  buildLoadJjcEvaluacion,
} from '@/features/jjc-mapper/composition/container';
import { mapAtencionToPdfFields } from './mapAtencionToPdfFields';

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

    // Fill text fields
    for (const [fieldName, value] of Object.entries(fieldMap.text)) {
      try {
        const field = form.getTextField(fieldName);
        field.setText(value ?? '');
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
          field.setText(values[i]);
        } catch {
          // Field might not exist — skip gracefully
        }
      }
    }

    // Flatten form to prevent editing
    form.flatten();

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
