import { ArrowLeft, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { JjcFaceLesionMapper } from '@/features/jjc-mapper/presentation/components/JjcFaceLesionMapper';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';

interface PageProps {
  params: Promise<{ idAtencion: string }>;
}

export default async function MedicinaJjcDetallePage({ params }: PageProps) {
  const { idAtencion } = await params;

  const useCase = buildGetAtencionDetalle();
  const atencion = await useCase.execute(idAtencion);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6 min-h-[80vh]">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Medicina · JJC
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Atención #{idAtencion}
          </p>
        </div>
        <div className="ml-auto">
          <Link
            href="/areas/medicina/jjc"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>
      </div>

      {/* Mapper */}
      <JjcFaceLesionMapper atencion={atencion} />
    </div>
  );
}
