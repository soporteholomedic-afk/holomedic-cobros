import { notFound } from 'next/navigation';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';
import { EvaluacionOsteomuscularProvider } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionLayoutShell } from '@/features/evaluacion-osteomuscular/presentation/components/EvaluacionLayoutShell';

interface LayoutProps {
  params: Promise<{ idAtencion: string }>;
  children: React.ReactNode;
}

export default async function EvaluacionLayout({ params, children }: LayoutProps) {
  const { idAtencion } = await params;

  const useCase = buildGetAtencionDetalle();
  const atencion = await useCase.execute(idAtencion);

  if (!atencion) {
    notFound();
  }

  return (
    <EvaluacionOsteomuscularProvider idAtencion={idAtencion} atencion={atencion}>
      <EvaluacionLayoutShell>{children}</EvaluacionLayoutShell>
    </EvaluacionOsteomuscularProvider>
  );
}
