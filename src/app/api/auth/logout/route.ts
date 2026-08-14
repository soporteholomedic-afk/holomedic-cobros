import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, getAuthCookieOptions } from '@/lib/auth';

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', getAuthCookieOptions(0));

  return NextResponse.json({ success: true });
}
