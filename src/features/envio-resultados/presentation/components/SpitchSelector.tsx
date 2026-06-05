'use client';

import { useState, useEffect, useRef } from 'react';
import { GetSptichesUseCase } from '../../application/getSptiches';
import { MockSpitchRepo } from '../../infrastructure/mock/spitchRepo';
import type { Spitch, SpitchType } from '../../domain/entities';

interface SpitchSelectorProps {
  target: 'company' | 'patient';
  onSelect: (spitch: Spitch) => void;
  selectedId?: string;
}

const getSptichesUseCase = new GetSptichesUseCase(new MockSpitchRepo());

export function SpitchSelector({ target, onSelect, selectedId }: SpitchSelectorProps) {
  const [spitches, setSptiches] = useState<Spitch[]>([]);
  const [loading, setLoading] = useState(true);
  const hasCalledOnSelect = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hasCalledOnSelect.current = false;

    getSptichesUseCase
      .execute(target as SpitchType)
      .then((data) => {
        if (!cancelled) {
          setSptiches(data);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  // Auto-select the first spitch or match selectedId
  useEffect(() => {
    if (!loading && spitches.length > 0 && !hasCalledOnSelect.current) {
      const match = selectedId
        ? spitches.find((s) => s.id === selectedId)
        : spitches[0];
      if (match) {
        onSelect(match);
        hasCalledOnSelect.current = true;
      }
    }
  }, [loading, spitches, selectedId, onSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const spitch = spitches.find((s) => s.id === e.target.value);
    if (spitch) {
      onSelect(spitch);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-slate-500">Cargando...</p>
    );
  }

  return (
    <select
      role="combobox"
      value={selectedId || spitches[0]?.id || ''}
      onChange={handleChange}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
    >
      {spitches.map((spitch) => (
        <option key={spitch.id} value={spitch.id}>
          {spitch.name}
        </option>
      ))}
    </select>
  );
}
