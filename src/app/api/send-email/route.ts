import { NextResponse } from 'next/server';

interface SendEmailBody {
  to: string;
}

function isValidBody(value: unknown): value is SendEmailBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'to' in value &&
    typeof (value as Record<string, unknown>).to === 'string'
  );
}

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();

    if (!isValidBody(raw)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Email queued (skeleton)',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }
}
