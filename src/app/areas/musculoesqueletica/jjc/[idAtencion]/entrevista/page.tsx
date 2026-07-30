import { notFound } from 'next/navigation';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';
import { EntrevistaOsteomuscularForm } from '@/features/entrevista-osteomuscular/presentation/components/EntrevistaOsteomuscularForm';

interface PageProps {
  params: Promise<{ idAtencion: string }>;
}

export default async function EntrevistaOsteomuscularPage({ params }: PageProps) {
  const { idAtencion } = await params;

  const useCase = buildGetAtencionDetalle();
  const atencion = await useCase.execute(idAtencion);

  if (!atencion) {
    notFound();
  }

  return <EntrevistaOsteomuscularForm idAtencion={idAtencion} atencion={atencion} />;
}
