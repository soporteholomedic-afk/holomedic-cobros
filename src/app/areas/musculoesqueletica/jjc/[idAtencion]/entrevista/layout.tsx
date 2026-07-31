import { notFound } from 'next/navigation';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';
import { EntrevistaOsteomuscularProvider } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { EntrevistaLayoutShell } from '@/features/entrevista-osteomuscular/presentation/components/EntrevistaLayoutShell';

interface LayoutProps {
  params: Promise<{ idAtencion: string }>;
  children: React.ReactNode;
}

export default async function EntrevistaLayout({ params, children }: LayoutProps) {
  const { idAtencion } = await params;

  const useCase = buildGetAtencionDetalle();
  const atencion = await useCase.execute(idAtencion);

  if (!atencion) {
    notFound();
  }

  return (
    <EntrevistaOsteomuscularProvider idAtencion={idAtencion} atencion={atencion}>
      <EntrevistaLayoutShell>{children}</EntrevistaLayoutShell>
    </EntrevistaOsteomuscularProvider>
  );
}
