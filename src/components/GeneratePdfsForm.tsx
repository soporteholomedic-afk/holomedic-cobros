"use client";

import { useState } from 'react';

interface FormData {
  idAten: string;
  codCli: string;
  codDCo: string;
  codEmp: string;
  codSed: string;
  codTCl: string;
  numOrd: string;
  emiAfi: boolean;
  incExp: boolean;
  user: string;
  pass: string;
  strict: boolean;
}

const initialForm: FormData = {
  idAten: '012109994',
  codCli: '3307',
  codDCo: '279',
  codEmp: '1',
  codSed: '1',
  codTCl: '2',
  numOrd: '109994',
  emiAfi: false,
  incExp: true,
  user: 'soporte',
  pass: 'soporte',
  strict: false,
};

export function GeneratePdfsForm() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/generate-pdfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codEmp: Number(form.codEmp),
          codSed: Number(form.codSed),
          codTCl: Number(form.codTCl),
          numOrd: Number(form.numOrd),
          idAten: form.idAten,
          codCli: Number(form.codCli),
          emiAfi: form.emiAfi,
          incExp: form.incExp,
          codDCo: form.codDCo ? Number(form.codDCo) : null,
          user: form.user,
          pass: form.pass,
          strict: form.strict,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Error ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.idAten}_pdfs.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const generated = response.headers.get('X-Pdf-Generated-Count');
      const exitCode = response.headers.get('X-Pdf-Exit-Code');
      setMessage(`Descarga iniciada. PDFs generados: ${generated}. Exit code: ${exitCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">IdAten</span>
          <input
            name="idAten"
            value={form.idAten}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CodCli</span>
          <input
            name="codCli"
            value={form.codCli}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CodDCo</span>
          <input
            name="codDCo"
            value={form.codDCo}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">NumOrd</span>
          <input
            name="numOrd"
            value={form.numOrd}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CodEmp</span>
          <input
            name="codEmp"
            value={form.codEmp}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CodSed</span>
          <input
            name="codSed"
            value={form.codSed}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CodTCl</span>
          <input
            name="codTCl"
            value={form.codTCl}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Usuario DB</span>
          <input
            name="user"
            value={form.user}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block col-span-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña DB</span>
          <input
            name="pass"
            type="password"
            value={form.pass}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            name="emiAfi"
            checked={form.emiAfi}
            onChange={handleChange}
          />
          EmiAfi
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            name="incExp"
            checked={form.incExp}
            onChange={handleChange}
          />
          IncExp
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            name="strict"
            checked={form.strict}
            onChange={handleChange}
          />
          Strict
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-medium py-2.5 transition-colors"
      >
        {loading ? 'Generando...' : 'Generar y descargar ZIP'}
      </button>

      {message && (
        <div className="text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
          {message}
        </div>
      )}
    </form>
  );
}
