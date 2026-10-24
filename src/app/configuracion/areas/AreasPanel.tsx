'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, X, Search, RotateCcw } from 'lucide-react';
import { useAuth } from '@/features/auth/presentation/hooks/useAuth';

interface Area {
  idArea: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

const initialForm = { nombre: '', descripcion: '' };

/**
 * The area-catalog CRUD surface (feature `areas-crud`, T4) rendered by
 * the `/configuracion` AREAS tab. Replaces the feature
 * `configuracion-tabs` empty placeholder now that `dbo.areas` and the
 * `/api/areas` routes exist.
 *
 * Soft delete (activo = 0) keeps the row so historical `usuarios.area`
 * references stay traceable; re-creating the same name reactivates it
 * server-side (CrearAreaUseCase).
 */
export function AreasPanel() {
  const { user, loading: authLoading } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user?.permisos.includes('admin')) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/areas');
        if (cancelled) return;
        if (!res.ok) throw new Error('Error al cargar áreas');
        const data = await res.json();
        setAreas(data.areas);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  function reload() {
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch('/api/areas');
        if (!res.ok) throw new Error('Error al cargar áreas');
        const data = await res.json();
        setAreas(data.areas);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar');
      } finally {
        setLoading(false);
      }
    })();
  }

  function openCreate() {
    setEditingId(null);
    setForm(initialForm);
    setShowModal(true);
  }

  function openEdit(a: Area) {
    setEditingId(a.idArea);
    setForm({ nombre: a.nombre, descripcion: a.descripcion ?? '' });
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        editingId ? `/api/areas/${editingId}` : '/api/areas',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: form.nombre,
            descripcion: form.descripcion,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al guardar');
      }
      setShowModal(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Desactivar área "${nombre}"? Los usuarios asignados no pierden el valor.`)) return;
    try {
      const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al desactivar');
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desactivar');
    }
  }

  async function handleReactivate(id: string) {
    try {
      const res = await fetch(`/api/areas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al reactivar');
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reactivar');
    }
  }

  // Search matches nombre OR descripcion, case-insensitively.
  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? areas.filter(
        (a) =>
          a.nombre.toLowerCase().includes(term)
          || (a.descripcion ?? '').toLowerCase().includes(term),
      )
    : areas;

  if (authLoading) {
    return <LoadingSkeleton />;
  }

  if (!user?.permisos.includes('admin')) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p className="text-slate-500">No autorizado</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Áreas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo de áreas para asignar usuarios
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition shadow-lg shadow-sky-600/20"
        >
          <Plus className="w-4 h-4" />
          Nueva Área
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar áreas..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none text-sm"
        />
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Nombre</Th>
                  <Th>Descripción</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.idArea} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <Td className="font-medium">{a.nombre}</Td>
                    <Td className="text-slate-500">{a.descripcion || '—'}</Td>
                    <Td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        a.activo
                          ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                      }`}>
                        {a.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </Td>
                    <Td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {a.activo ? (
                          <>
                            <button
                              onClick={() => openEdit(a)}
                              className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950 transition"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(a.idArea, a.nombre)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition"
                              title="Desactivar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleReactivate(a.idArea)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reactivar
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                    {areas.length === 0
                      ? 'No hay áreas registradas. Creá la primera con «Nueva Área».'
                      : 'No se encontraron áreas'}
                  </td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Editar Área' : 'Nueva Área'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</span>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  required
                  maxLength={200}
                  placeholder="Nombre del área (ej: Enfermería)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descripción <span className="text-slate-400 font-normal">(opcional)</span>
                </span>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                  maxLength={500}
                  rows={3}
                  placeholder="Para qué sirve el área (ej: Personal de enfermería)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none resize-none"
                />
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function LoadingSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">
      <div className="space-y-4 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
