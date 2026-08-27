import { notFound } from 'next/navigation';

import { FirmaForm } from '@/features/firma-correo/presentation/components/FirmaForm';
import { resolveFirmaPageData } from './resolveFirmaPageData';

/**
 * The signature editor page for one registered area —
 * `/admin/plantillas/{area}/firma` (editor-firmas task 3.2, Server
 * Component).
 *
 * Spec `firma-correo` / "Access Control": the route is gated by the
 * proxy through its `firma_correo` `RUTAS_PROTEGIDAS` entry (longest
 * prefix beats the generic `/admin/plantillas` gate — PR2), so a user
 * holding ONLY `firma_correo` reaches this page.
 *
 * Responsibilities (page/resolver pattern — all loading lives in
 * `resolveFirmaPageData`, which is the unit-tested piece):
 *  1. `await params` (Next.js App Router dynamic segment).
 *  2. Resolve the page data — unregistered area / no session / missing
 *     user → `notFound()` (404).
 *  3. Render the client `FirmaForm` (the only `"use client"` leaf)
 *     with the stored signature or the user-record prefill.
 *
 * Default export: Next.js App Router convention for page files.
 */
interface FirmaAreaPageProps {
  params: Promise<{ area: string }>;
}

export default async function FirmaAreaPage({ params }: FirmaAreaPageProps) {
  const { area } = await params;
  const resolved = await resolveFirmaPageData(area);
  if (resolved.notFound) {
    notFound();
  }
  return <FirmaForm initialFirma={resolved.initialFirma} />;
}
