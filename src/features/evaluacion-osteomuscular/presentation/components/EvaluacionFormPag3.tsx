'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';
import { AnatomicalImage } from './AnatomicalImage';
import { parseOptionalNumber } from '../helpers/parseOptionalNumber';
import type {
  DxIxBool,
  GravedadPatologia,
  ParestesiaNerviosa,
} from '@/types/evaluacion-osteomuscular';

type Lado = 'dx' | 'ix';

interface CheckDxIxProps {
  basePath: string;
  checked: DxIxBool;
  lado: Lado;
  ariaLabel?: string;
}

function CheckDxIx({ basePath, checked, lado, ariaLabel }: CheckDxIxProps) {
  const { setDxIx } = useEvaluacionContext();
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked[lado]}
        onChange={(e) => setDxIx(basePath, lado, e.target.checked)}
      />{' '}
      {lado === 'dx' ? 'Dx' : 'Ix'}
    </label>
  );
}

interface CheckSimpleProps {
  path: string;
  checked: boolean;
  ariaLabel?: string;
}

function CheckSimple({ path, checked, ariaLabel }: CheckSimpleProps) {
  const { setField } = useEvaluacionContext();
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => setField(path, e.target.checked)}
    />
  );
}

interface RadioGravedadProps {
  value: GravedadPatologia;
  current: GravedadPatologia | null;
  path: string;
  groupName: string;
}

function RadioGravedad({ value, current, path, groupName }: RadioGravedadProps) {
  const { setField } = useEvaluacionContext();
  return (
    <label className="inline-flex items-center space-x-1 cursor-pointer">
      <input
        type="radio"
        name={groupName}
        value={value}
        checked={current === value}
        onChange={() => setField(path, value)}
      />
      <span>{value}</span>
    </label>
  );
}

interface DistalRowProps {
  label: string;
  ariaLabel: string;
  basePath: string;
  checked: DxIxBool;
}

function DistalRow({ label, ariaLabel, basePath, checked }: DistalRowProps) {
  return (
    <div className="flex justify-between items-center pr-1">
      <span>{label}</span>
      <div className="space-x-1 text-[10px] font-bold">
        <CheckDxIx basePath={basePath} checked={checked} lado="dx" ariaLabel={`${ariaLabel} Dx`} />
        <CheckDxIx basePath={basePath} checked={checked} lado="ix" ariaLabel={`${ariaLabel} Ix`} />
      </div>
    </div>
  );
}

interface DistalTestProps {
  title: string;
  instruction: string;
  imageSrc: string;
  imageAlt: string;
  testKey: 'testPhalen' | 'testPresion';
  parestesia: ParestesiaNerviosa;
}

function DistalTest({ title, instruction, imageSrc, imageAlt, testKey, parestesia }: DistalTestProps) {
  const base = `${SPX}.regionDistal.${testKey}.parestesia`;
  const prefix = testKey === 'testPhalen' ? 'Phalen' : 'Presión';
  return (
    <div>
      <div className="bg-gray-100 font-bold p-1 px-2 border-b border-gray-900 uppercase text-[10px]">
        {title}
      </div>
      <div className="p-2 space-y-1">
        <p className="text-[8.5px] uppercase font-semibold text-gray-700">{instruction}</p>
        <div className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-6">
            <AnatomicalImage src={imageSrc} alt={imageAlt} className="w-full h-20" sizes="160px" />
          </div>
          <div className="col-span-6 space-y-1 text-[9.5px] font-semibold">
            <p className="font-bold">Parestesia:</p>
            <DistalRow
              label="N. MEDIANO"
              ariaLabel={`${prefix} nervio mediano`}
              basePath={`${base}.nervioMediano`}
              checked={parestesia.nervioMediano}
            />
            <DistalRow
              label="N. ULNAR"
              ariaLabel={`${prefix} nervio ulnar`}
              basePath={`${base}.nervioUlnar`}
              checked={parestesia.nervioUlnar}
            />
            <div className="pt-1">
              <p className="text-[8.5px] font-bold uppercase leading-none">NO TERRITORIALIZADA</p>
              <div className="space-x-2 text-[10px] font-bold pl-1 mt-0.5">
                <CheckDxIx
                  basePath={`${base}.noTerritorializada`}
                  checked={parestesia.noTerritorializada}
                  lado="dx"
                  ariaLabel={`${prefix} no territorializada Dx`}
                />
                <CheckDxIx
                  basePath={`${base}.noTerritorializada`}
                  checked={parestesia.noTerritorializada}
                  lado="ix"
                  ariaLabel={`${prefix} no territorializada Ix`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const BASE_MUNECA = 'evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano';
const SPX = `${BASE_MUNECA}.sintomatologiaParestesica`;

const MOVIMIENTO_ITEMS: ReadonlyArray<{
  field: 'flexion' | 'extension' | 'inclinacionDerecha' | 'inclinacionIzquierda' | 'rotacionDerecha' | 'rotacionIzquierda';
  label: string;
  ariaLabel: string;
}> = [
  { field: 'flexion', label: 'FLEXIÓN', ariaLabel: 'Flexión' },
  { field: 'extension', label: 'EXTENSIÓN', ariaLabel: 'Extensión' },
  { field: 'inclinacionDerecha', label: 'INCLINACIÓN DER', ariaLabel: 'Inclinación Derecha' },
  { field: 'inclinacionIzquierda', label: 'INCLINACIÓN IZQ', ariaLabel: 'Inclinación Izquierda' },
  { field: 'rotacionDerecha', label: 'ROTACIÓN DER', ariaLabel: 'Rotación Derecha' },
  { field: 'rotacionIzquierda', label: 'ROTACIÓN IZQ', ariaLabel: 'Rotación Izquierda' },
];

const FLEXO_ITEMS: ReadonlyArray<{
  field: 'dolorFlexionContraResistencia' | 'dolorFlexionPasiva' | 'dolorExtensionContraResistencia' | 'dolorExtensionPasiva';
  label: string;
}> = [
  { field: 'dolorFlexionContraResistencia', label: 'FLEXIÓN C/R' },
  { field: 'dolorFlexionPasiva', label: 'FLEXIÓN PASIVA' },
  { field: 'dolorExtensionContraResistencia', label: 'EXTENSIÓN C/R' },
  { field: 'dolorExtensionPasiva', label: 'EXTENSIÓN PASIVA' },
];

export function EvaluacionFormPag3() {
  const { idAtencion, state, setField } = useEvaluacionContext();

  const munecaMano = useMemo(
    () => state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano,
    [state],
  );

  const s = munecaMano.sintomatologiaParestesica;
  const px = s.regionProximal;
  const e = s.examenInstrumental;

  return (
    <div className="evaluation-page evaluation-page--page3 min-h-screen bg-gray-100 py-6 text-xs leading-tight text-black">
      <form
        onSubmit={(ev) => ev.preventDefault()}
        className="max-w-4xl mx-auto bg-white border border-gray-900 p-3 shadow-md space-y-2"
      >
        {/* 1. FINKELSTEIN Y FLEXO-EXTENSIÓN DE LA MUÑECA */}
        <div className="border border-gray-900 grid grid-cols-12 divide-x divide-gray-900">
          {/* COLUMNA IZQUIERDA: FINKELSTEIN */}
          <div className="col-span-5 flex flex-col justify-between">
            <div className="bg-gray-200 font-bold p-1 px-2 uppercase border-b border-gray-900 text-[11px]">
              FINKELSTEIN{' '}
              <span className="normal-case text-[10px] font-normal">(DESVIACION ULNAR DE LA MUÑECA)</span>
            </div>
            <div className="p-2 grid grid-cols-12 gap-2 items-center my-auto">
              <div className="col-span-7">
                <AnatomicalImage
                  src="/assets/images/musculo/entrevista/flexo-extension-muneca.jpg"
                  alt="Test de Finkelstein"
                  className="w-full h-24"
                  sizes="240px"
                />
              </div>
              <div className="col-span-5 space-y-3 font-semibold text-[10px]">
                <p className="leading-tight">DOLOR EN &quot;TABAQUERA ANATÓMICA&quot;</p>
                <div className="flex space-x-3 font-bold text-[11px] pl-1">
                  <CheckDxIx
                    basePath={`${BASE_MUNECA}.finkelstein.dolorTabaqueraAnatomica`}
                    checked={munecaMano.finkelstein.dolorTabaqueraAnatomica}
                    lado="dx"
                    ariaLabel="Tabaquera anatómica Dx"
                  />
                  <CheckDxIx
                    basePath={`${BASE_MUNECA}.finkelstein.dolorTabaqueraAnatomica`}
                    checked={munecaMano.finkelstein.dolorTabaqueraAnatomica}
                    lado="ix"
                    ariaLabel="Tabaquera anatómica Ix"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: FLEXO-EXTENSIÓN DE LA MUÑECA */}
          <div className="col-span-7 flex flex-col justify-between">
            <div className="bg-gray-200 font-bold p-1 px-2 uppercase border-b border-gray-900 text-[11px]">
              FLEXO-EXTENSIÓN DE LA MUÑECA:{' '}
              <span className="text-[10px] font-semibold">MOTILIDAD PASIVA Y CONTRA RESISTENCIA (C/R)</span>
            </div>
            <div className="p-2 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <AnatomicalImage
                  src="/assets/images/musculo/entrevista/dedo-gatillo.jpg"
                  alt="Flexo-extensión pasiva y contra resistencia de la muñeca"
                  className="w-full h-28"
                  sizes="240px"
                />
              </div>
              <div className="col-span-7 space-y-1.5 text-[9.5px] font-semibold">
                {FLEXO_ITEMS.map((item, idx) => (
                  <div key={item.field} className={`space-y-0.5 ${idx > 0 ? 'pt-1 border-t border-gray-200' : ''}`}>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <CheckSimple
                        path={`${BASE_MUNECA}.flexoExtensionMuneca.${item.field}.dx`}
                        checked={munecaMano.flexoExtensionMuneca[item.field].dx}
                        ariaLabel={`Dolor en ${item.label.toLowerCase()} Dx`}
                      />
                      <span>DOLOR EN {item.label} DX</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <CheckSimple
                        path={`${BASE_MUNECA}.flexoExtensionMuneca.${item.field}.ix`}
                        checked={munecaMano.flexoExtensionMuneca[item.field].ix}
                        ariaLabel={`Dolor en ${item.label.toLowerCase()} Ix`}
                      />
                      <span>DOLOR EN {item.label} IX</span>
                    </label>
                  </div>
                ))}
                <div className="flex items-center space-x-1 pt-1">
                  <span className="font-bold">OTROS:</span>
                  <input
                    type="text"
                    aria-label="Otros flexo-extensión muñeca"
                    value={munecaMano.flexoExtensionMuneca.otros}
                    onChange={(ev) =>
                      setField(`${BASE_MUNECA}.flexoExtensionMuneca.otros`, ev.target.value)
                    }
                    className="w-40 border-b border-gray-800 text-center outline-none p-0 font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. SECCIÓN d: SINTOMATOLOGÍA PARESTESICA */}
        <div className="border border-gray-900">
          <div className="bg-gray-200 p-1 font-bold border-b border-gray-900 flex items-center justify-between text-[12px]">
            <div className="text-amber-900 font-extrabold uppercase">
              d) SINTOMATOLOGÍA PARESTESICA:{' '}
              <span className="text-amber-800">REALIZA MANIOBRAS</span>
            </div>
            <label className="inline-flex items-center space-x-1 text-black font-semibold cursor-pointer">
              <CheckSimple
                path={`${BASE_MUNECA}.realizaManiobras`}
                checked={munecaMano.realizaManiobras}
              />
              <span>SI</span>
            </label>
          </div>

          {/* Duración de molestias */}
          <div className="p-1.5 border-b border-gray-900 space-y-1 font-bold text-[11px] px-3">
            <div>
              <span>MOLESTIA (PARESTESICO) MUÑECA Dx desde</span>{' '}
              <input
                type="number"
                min={0}
                aria-label="Molestia muñeca Dx desde meses"
                value={munecaMano.molestiaMunecaDxDesdeMeses ?? ''}
                onChange={(ev) =>
                  setField(
                    `${BASE_MUNECA}.molestiaMunecaDxDesdeMeses`,
                    ev.target.value === '' ? null : Number(ev.target.value),
                  )
                }
                className="w-24 border-b border-gray-800 text-center outline-none p-0 mx-1 font-semibold"
              />
              <span>(meses)</span>
            </div>
            <div>
              <span>MOLESTIA (PARESTESICO) MUÑECA Ix desde</span>{' '}
              <input
                type="number"
                min={0}
                aria-label="Molestia muñeca Ix desde meses"
                value={munecaMano.molestiaMunecaIxDesdeMeses ?? ''}
                onChange={(ev) =>
                  setField(
                    `${BASE_MUNECA}.molestiaMunecaIxDesdeMeses`,
                    ev.target.value === '' ? null : Number(ev.target.value),
                  )
                }
                className="w-24 border-b border-gray-800 text-center outline-none p-0 mx-1 font-semibold"
              />
              <span>(meses)</span>
            </div>
          </div>

          {/* 3. REGIÓN PROXIMAL */}
          <div>
            <div className="bg-gray-200 font-bold p-1 text-center border-b border-gray-900 uppercase text-[11px]">
              REGIÓN PROXIMAL
            </div>
            <div className="grid grid-cols-12 divide-x divide-gray-900 text-[10px]">
              {/* Columna 1: Dolor a la presión o palpación */}
              <div className="col-span-3 p-2 space-y-2">
                <p className="font-bold">Dolor a la presión o palpación:</p>
                <div className="space-y-1.5 font-semibold text-[9.5px]">
                  <div className="flex justify-between items-center pr-2">
                    <span>APOFISIS ESPINOSA</span>
                    <CheckSimple
                      path={`${SPX}.regionProximal.dolorPresionPalpacion.apofisisEspinosa`}
                      checked={px.dolorPresionPalpacion.apofisisEspinosa}
                      ariaLabel="Apófisis Espinosa"
                    />
                  </div>
                  <div className="flex justify-between items-center pr-2">
                    <span>M. TRAPECIO SUP.</span>
                    <CheckSimple
                      path={`${SPX}.regionProximal.dolorPresionPalpacion.mTrapecioSuperior`}
                      checked={px.dolorPresionPalpacion.mTrapecioSuperior}
                      ariaLabel="M. Trapecio Superior"
                    />
                  </div>
                  <div className="flex justify-between items-center pr-2">
                    <span>M. PARAVERTEBRAL</span>
                    <CheckSimple
                      path={`${SPX}.regionProximal.dolorPresionPalpacion.mParavertebral`}
                      checked={px.dolorPresionPalpacion.mParavertebral}
                      ariaLabel="M. Paravertebral"
                    />
                  </div>
                  <div className="flex justify-between items-center pr-2">
                    <span className="font-bold">OTROS:</span>
                    <input
                      type="text"
                      aria-label="Otros dolor presión palpación región proximal"
                      value={px.dolorPresionPalpacion.otros}
                      onChange={(ev) =>
                        setField(
                          `${SPX}.regionProximal.dolorPresionPalpacion.otros`,
                          ev.target.value,
                        )
                      }
                      className="w-24 border-b border-gray-800 text-center outline-none p-0 font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Columna 2: Dolor al movimiento */}
              <div className="col-span-3 p-2 space-y-2">
                <p className="font-bold">Dolor al movimiento:</p>
                <div className="space-y-1 font-semibold text-[9.5px]">
                  {MOVIMIENTO_ITEMS.map((item) => (
                    <div key={item.field} className="flex justify-between items-center pr-2">
                      <span>{item.label}</span>
                      <CheckSimple
                        path={`${SPX}.regionProximal.dolorMovimiento.${item.field}`}
                        checked={px.dolorMovimiento[item.field]}
                        ariaLabel={item.ariaLabel}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna 3: Test de Fatiga */}
              <div className="col-span-3 p-2 flex flex-col justify-between items-center text-center">
                <AnatomicalImage
                  src="/assets/images/musculo/entrevista/test-fatiga.png"
                  alt="Test de fatiga con brazos elevados"
                  className="w-full h-24"
                  sizes="200px"
                />
                <div className="space-y-1 pt-1 w-full">
                  <p className="font-bold text-[9px]">Test de fatiga (por 30&quot;)</p>
                  <div className="flex justify-center space-x-3 font-semibold text-[10px]">
                    <span>Parestesia:</span>
                    <CheckDxIx
                      basePath={`${SPX}.regionProximal.testFatiga.parestesia`}
                      checked={px.testFatiga.parestesia}
                      lado="dx"
                      ariaLabel="Test de fatiga Dx"
                    />
                    <CheckDxIx
                      basePath={`${SPX}.regionProximal.testFatiga.parestesia`}
                      checked={px.testFatiga.parestesia}
                      lado="ix"
                      ariaLabel="Test de fatiga Ix"
                    />
                  </div>
                </div>
              </div>

              {/* Columna 4: Test del Candelero */}
              <div className="col-span-3 p-2 flex flex-col justify-between items-center text-center">
                <AnatomicalImage
                  src="/assets/images/musculo/entrevista/test-candelero.png"
                  alt="Test del candelero"
                  className="w-full h-24"
                  sizes="200px"
                />
                <div className="space-y-1 pt-1 w-full">
                  <p className="font-bold text-[9px]">Test del Candelero (por 30&quot;)</p>
                  <div className="flex justify-center space-x-3 font-semibold text-[10px]">
                    <span>Parestesia:</span>
                    <CheckDxIx
                      basePath={`${SPX}.regionProximal.testCandelero.parestesia`}
                      checked={px.testCandelero.parestesia}
                      lado="dx"
                      ariaLabel="Test de candelero Dx"
                    />
                    <CheckDxIx
                      basePath={`${SPX}.regionProximal.testCandelero.parestesia`}
                      checked={px.testCandelero.parestesia}
                      lado="ix"
                      ariaLabel="Test de candelero Ix"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. REGIÓN DISTAL */}
          <div className="border-t border-gray-900">
            <div className="bg-gray-200 font-bold p-1 text-center border-b border-gray-900 uppercase text-[11px]">
              REGION DISTAL
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-900">
              <DistalTest
                title="TEST DE PHALEN"
                instruction={'MANTENER LA POSICIÓN POR 60"'}
                imageSrc="/assets/images/musculo/entrevista/test-phalen.jpg"
                imageAlt="Test de Phalen"
                testKey="testPhalen"
                parestesia={s.regionDistal.testPhalen.parestesia}
              />
              <DistalTest
                title="TEST DE PRESION"
                instruction={'COMPRESIÓN DORSAL DE LA MUÑECA POR 30"'}
                imageSrc="/assets/images/musculo/entrevista/test-presion-muneca.jpg"
                imageAlt="Test de presión dorsal de la muñeca"
                testKey="testPresion"
                parestesia={s.regionDistal.testPresion.parestesia}
              />
            </div>
          </div>
        </div>

        {/* 5. EXAMEN INSTRUMENTAL REALIZADO */}
        <div className="border border-gray-900 p-1.5 flex flex-wrap items-center justify-between text-[11px] gap-2">
          <span className="font-bold">Examen instrumental realizado:</span>
          <label className="inline-flex items-center space-x-1 cursor-pointer">
            <CheckSimple
              path={`${SPX}.examenInstrumental.noRealizado`}
              checked={e.noRealizado}
            />
            <span className="font-bold">NO</span>
          </label>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${SPX}.examenInstrumental.ecografia`}
                checked={e.ecografia}
                ariaLabel="Ecografía"
              />
              <span>ECOGRAFÍA (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año ecografía"
              value={e.ecografiaAno ?? ''}
              onChange={(ev) =>
                setField(`${SPX}.examenInstrumental.ecografiaAno`, parseOptionalNumber(ev.target.value))
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${SPX}.examenInstrumental.rx`}
                checked={e.rx}
                ariaLabel="RX"
              />
              <span>RX (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año RX"
              value={e.rxAno ?? ''}
              onChange={(ev) =>
                setField(`${SPX}.examenInstrumental.rxAno`, parseOptionalNumber(ev.target.value))
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${SPX}.examenInstrumental.rmn`}
                checked={e.rmn}
                ariaLabel="RMN"
              />
              <span>RMN (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año RMN"
              value={e.rmnAno ?? ''}
              onChange={(ev) =>
                setField(`${SPX}.examenInstrumental.rmnAno`, parseOptionalNumber(ev.target.value))
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${SPX}.examenInstrumental.emg`}
                checked={e.emg}
                ariaLabel="EMG"
              />
              <span>EMG (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año EMG"
              value={e.emgAno ?? ''}
              onChange={(ev) =>
                setField(`${SPX}.examenInstrumental.emgAno`, parseOptionalNumber(ev.target.value))
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>
        </div>

        {/* 6. GRAVEDAD PATOLOGÍA MANO MUÑECA */}
        <div className="border border-gray-900 bg-gray-100 p-1.5 flex items-center justify-between text-[11px]">
          <span className="font-bold uppercase">GRAVEDAD PATOLOGÍA MANO MUÑECA (última página)</span>
          <div className="flex space-x-6 font-bold">
            <RadioGravedad
              value="LEVE"
              current={s.gravedadPatologiaManoMuneca}
              path={`${SPX}.gravedadPatologiaManoMuneca`}
              groupName="gravedadManoMuneca"
            />
            <RadioGravedad
              value="MEDIA"
              current={s.gravedadPatologiaManoMuneca}
              path={`${SPX}.gravedadPatologiaManoMuneca`}
              groupName="gravedadManoMuneca"
            />
            <RadioGravedad
              value="GRAVE"
              current={s.gravedadPatologiaManoMuneca}
              path={`${SPX}.gravedadPatologiaManoMuneca`}
              groupName="gravedadManoMuneca"
            />
          </div>
        </div>

        {/* 7. APROXIMACION DIAGNOSTICA DE EVALUACION */}
        <div className="border border-gray-900">
          <div className="bg-gray-200 font-bold p-1 px-2 uppercase border-b border-gray-900 text-[11px]">
            APROXIMACION DIAGNOSTICA DE EVALUACION
          </div>
          <div className="p-2">
            <textarea
              aria-label="Aproximación diagnóstica de la evaluación"
              rows={3}
              value={s.aproximacionDiagnosticaEvaluacion}
              onChange={(ev) => setField(`${SPX}.aproximacionDiagnosticaEvaluacion`, ev.target.value)}
              placeholder="Escriba la aproximación diagnóstica aquí..."
              className="w-full border-0 outline-none text-xs p-1 resize-none uppercase"
            />
          </div>
        </div>

        {/* 8. FIRMA Y DATOS DEL MÉDICO */}
        <div className="pt-4 space-y-1 font-bold text-[10px]">
          <p>NOMBRE Y APELLIDOS</p>
          <p>FIRMA-SELLO</p>
          <p>MEDICO EVALUADOR / OCUPACIONAL</p>
        </div>

        {/* LEYENDA */}
        <div className="text-[10px] font-bold pt-1">
          Dx.= Derecho&nbsp;&nbsp;&nbsp; Ix.= Izq
        </div>

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-center text-[9px] text-gray-600 pt-2 border-t border-gray-300">
          <div>
            Fo. JJC-SIGLA-13-31 Cuestionario anamnesico y evaluación de extremidad superior y espalda. Rev. 0
          </div>
          <div className="font-bold text-gray-900 text-xs">
            5
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={3}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
