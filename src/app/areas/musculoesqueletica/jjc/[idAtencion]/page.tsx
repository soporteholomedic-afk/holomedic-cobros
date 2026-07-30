import { ArrowLeft, Bone, ClipboardList, Activity } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildGetAtencionDetalle } from '@/features/jjc-mapper/composition/container';

interface PageProps {
  params: Promise<{ idAtencion: string }>;
}

export default async function MusculoEsqueleticaJjcDetallePage({ params }: PageProps) {
  const { idAtencion } = await params;

  const useCase = buildGetAtencionDetalle();
  const atencion = await useCase.execute(idAtencion);

  if (!atencion) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6 min-h-[80vh]">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400">
          <Bone className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            MusculoEsqueletica · JJC
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Atención #{idAtencion}
          </p>
        </div>
        <div className="ml-auto">
          <Link
            href="/areas/musculoesqueletica/jjc"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>
      </div>

      {/* Patient info card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Datos del Paciente
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">DNI</p>
            <p className="text-slate-700 font-mono">{atencion.dni}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nombre</p>
            <p className="text-slate-700 font-medium">{atencion.paciente}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Empresa</p>
            <p className="text-slate-700">{atencion.empresa}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Puesto</p>
            <p className="text-slate-700">{atencion.puesto}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha Atención</p>
            <p className="text-slate-700">{atencion.fechaAtencion}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo Examen</p>
            <p className="text-slate-700">{atencion.tipoExamen}</p>
          </div>
        </div>
      </div>

      {/* Options grid */}
      <h2 className="text-lg font-semibold text-slate-800 mt-4">
        Seleccionar tipo de evaluación
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
          className="group rounded-xl border border-slate-200 bg-white p-8 hover:border-sky-300 hover:shadow-md hover:shadow-sky-100 transition-all duration-200"
        >
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-50 text-sky-600 shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 mb-2">
                ENTREVISTA DE CUESTIONARIO ANAMNÉSICO OSTEMUSCULAR
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Registro del cuestionario anamnésico para patologías osteomusculares.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 group-hover:text-sky-700">
                Ingresar
              </span>
            </div>
          </div>
        </Link>

        <Link
          href={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
          className="group rounded-xl border border-slate-200 bg-white p-8 hover:border-sky-300 hover:shadow-md hover:shadow-sky-100 transition-all duration-200"
        >
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-50 text-sky-600 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 mb-2">
                EVALUACIÓN CLINICA OSTEMUSCULAR
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Evaluación clínica completa del sistema osteomuscular.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 group-hover:text-sky-700">
                Ingresar
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
