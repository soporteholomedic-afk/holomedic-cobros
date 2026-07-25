'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Upload, X, Search, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/features/auth/presentation/hooks/useAuth';
import { PERMISOS, type Permiso } from '@/features/auth/domain/entities';

interface Usuario {
  idUsuario: string;
  nombre: string;
  area: string;
  permisos: string[];
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

const initialForm = { nombre: '', area: '', contrasena: '', permisos: [] as Permiso[] };

export default function UsuariosPage() {
  const { user, loading: authLoading } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.permisos.includes('admin')) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/usuarios');
        if (cancelled) return;
        if (!res.ok) throw new Error('Error al cargar usuarios');
        const data = await res.json();
        setUsuarios(data.usuarios);
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
        const res = await fetch('/api/usuarios');
        if (!res.ok) throw new Error('Error al cargar usuarios');
        const data = await res.json();
        setUsuarios(data.usuarios);
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

  function openEdit(u: Usuario) {
    setEditingId(u.idUsuario);
    setForm({
      nombre: u.nombre,
      area: u.area,
      contrasena: '',
      permisos: u.permisos as Permiso[],
    });
    setShowModal(true);
  }

  function togglePermiso(p: Permiso) {
    setForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(p)
        ? prev.permisos.filter((x) => x !== p)
        : [...prev.permisos, p],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const body: Record<string, unknown> = {
          nombre: form.nombre,
          area: form.area,
          permisos: form.permisos,
        };
        if (form.contrasena) body.contrasena = form.contrasena;
        const res = await fetch(`/api/usuarios/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Error al actualizar');
        }
      } else {
        const res = await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Error al crear');
        }
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
    if (!confirm(`¿Desactivar usuario "${nombre}"?`)) return;
    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al desactivar');
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desactivar');
    }
  }

  async function handleFirma(id: string, file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.append('firma', file);
    try {
      const res = await fetch(`/api/usuarios/${id}/firma`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Error al subir firma');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir firma');
    }
  }

  const filtered = usuarios.filter((u) =>
    !searchTerm || u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || u.area.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Usuarios</h1>
          <p className="text-sm text-slate-500 mt-1">Gestión de usuarios del sistema</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition shadow-lg shadow-sky-600/20"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
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
          placeholder="Buscar usuarios..."
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
                  <Th>Área</Th>
                  <Th>Permisos</Th>
                  <Th>Estado</Th>
                  <Th>Firma</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.idUsuario} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <Td className="font-medium">{u.nombre}</Td>
                    <Td className="capitalize text-slate-500">{u.area}</Td>
                    <Td>
                      <PermisosCell permisos={u.permisos} />
                    </Td>
                    <Td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        u.activo
                          ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                      }`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </Td>
                    <Td>
                      <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                        <Upload className="w-3 h-3" />
                        Subir
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFirma(u.idUsuario, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Td>
                    <Td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950 transition"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.idUsuario, u.nombre)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition"
                          title="Desactivar"
                          disabled={u.idUsuario === user?.idUsuario}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                      No se encontraron usuarios
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Área</label>
                <input
                  type="text"
                  value={form.area}
                  onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contraseña {editingId && <span className="text-slate-400 font-normal">(dejar vacío para mantener)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.contrasena}
                    onChange={(e) => setForm((p) => ({ ...p, contrasena: e.target.value }))}
                    required={!editingId}
                    minLength={4}
                    className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Permisos</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISOS.map((p) => (
                    <label key={p} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                      <input
                        type="checkbox"
                        checked={form.permisos.includes(p)}
                        onChange={() => togglePermiso(p)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || form.permisos.length === 0}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${className ?? ''}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-sm text-slate-900 dark:text-white ${className ?? ''}`}>
      {children}
    </td>
  );
}

function PermisosCell({ permisos }: { permisos: string[] }) {
  const allPermisos = permisos.length === PERMISOS.length;

  if (allPermisos) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
        todos
      </span>
    );
  }

  if (permisos.length > 2) {
    const visible = permisos.slice(0, 2);
    const restantes = permisos.length - 2;

    return (
      <div className="flex flex-wrap gap-1">
        {visible.map((p) => (
          <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
            {p}
          </span>
        ))}
        <div className="relative group">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-help transition-all duration-500 delay-0 group-hover:delay-0">
            +{restantes} permisos
          </span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10">
            <div className="bg-slate-900 dark:bg-slate-700 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
              <div className="flex flex-col gap-1">
                {permisos.slice(2).map((p) => (
                  <span key={p} className="capitalize">{p}</span>
                ))}
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {permisos.map((p) => (
        <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
          {p}
        </span>
      ))}
    </div>
  );
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
