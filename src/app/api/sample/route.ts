import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileParam = searchParams.get('file') || '1';
    
    let fileName = 'rpt_cuenta_por_cobrar_saldo.xlsx';
    if (fileParam === '2') {
      fileName = 'rpt_cuenta_por_cobrar_saldo2.xlsx';
    }
    
    // The files are located in the project root directory
    const filePath = path.join(process.cwd(), fileName);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `File not found: ${fileName}. Please make sure it is in the root directory.` },
        { status: 404 }
      );
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    console.error('Error in sample file API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
