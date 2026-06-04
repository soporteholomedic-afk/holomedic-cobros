import { NextResponse } from 'next/server';
import { parseValoracionesCsvContent, generateValoracionesWorkbook } from '@/utils/valoraciones';

// ---- POST handler ----

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const company = formData.get('company');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No se proporcionó un archivo CSV' },
        { status: 400 },
      );
    }

    const csvText = await file.text();
    const groupedData = parseValoracionesCsvContent(csvText);

    // Optional company filter (case-insensitive)
    const companyFilter =
      typeof company === 'string' ? company.trim() : '';
    if (companyFilter) {
      groupedData.companies = groupedData.companies.filter(
        (c) => c.company.toLowerCase() === companyFilter.toLowerCase(),
      );
    }

    const buffer = generateValoracionesWorkbook(groupedData);

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const filename = companyFilter
      ? `valoraciones_${companyFilter}_${year}-${month}-${day}.xlsx`
      : `valoraciones_por_empresa_${year}-${month}-${day}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    console.error('valoraciones generate route error:', error);
    return NextResponse.json(
      { error: message || 'Error al generar el Excel de valoraciones' },
      { status: 500 },
    );
  }
}
