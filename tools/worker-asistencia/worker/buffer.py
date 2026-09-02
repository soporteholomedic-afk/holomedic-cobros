"""Append-only SQLite buffer for device punches (REQ-F1-05/06).

Durability contract: rows are INSERTed once and only ever flip estado
'pendiente' -> 'enviado'. There is intentionally NO code path that
removes rows — a restart simply reopens the same file and the pending
queue survives. Batches handed to the sender are capped at 200 rows in
stable id order; marking a batch sent does NOT advance the queue until
the caller confirms, so a failed POST simply retries the same batch
(server-side dedup absorbs re-sends).

Command ids already applied are tracked in ``comandos_aplicados`` so
command execution stays idempotent across restarts.
"""

from __future__ import annotations

import sqlite3
import threading

LOTE_DEFECTO = 200

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS marcaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  fecha_hora TEXT NOT NULL,
  punch INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS comandos_aplicados (
  id INTEGER PRIMARY KEY,
  aplicado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_marcaciones_estado_id ON marcaciones (estado, id);
"""


class BufferAsistencia:
    """SQLite-backed append-only queue shared by the worker threads."""

    def __init__(self, ruta_db: str):
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(ruta_db, check_same_thread=False)
        self._conn.executescript(_ESQUEMA)
        self._conn.commit()

    def agregar_marcaciones(self, items: list[dict]) -> int:
        if not items:
            return 0
        filas = [(i["user_id"], i["fecha_hora"], int(i["punch"]), i["tipo"]) for i in items]
        with self._lock:
            self._conn.executemany(
                "INSERT INTO marcaciones (user_id, fecha_hora, punch, tipo)"
                " VALUES (?, ?, ?, ?)",
                filas,
            )
            self._conn.commit()
        return len(filas)

    def tomar_pendientes(self, limite: int = LOTE_DEFECTO) -> list[dict]:
        with self._lock:
            filas = self._conn.execute(
                "SELECT id, user_id, fecha_hora, punch, tipo FROM marcaciones"
                " WHERE estado = 'pendiente' ORDER BY id LIMIT ?",
                (limite,),
            ).fetchall()
        return [
            {
                "id": f[0],
                "user_id": f[1],
                "fecha_hora": f[2],
                "punch": f[3],
                "tipo": f[4],
            }
            for f in filas
        ]

    def marcar_enviadas(self, ids: list[int]) -> None:
        if not ids:
            return
        placeholders = ",".join("?" for _ in ids)
        with self._lock:
            self._conn.execute(
                f"UPDATE marcaciones SET estado = 'enviado' WHERE id IN ({placeholders})",
                list(ids),
            )
            self._conn.commit()

    def total_filas(self) -> int:
        with self._lock:
            (total,) = self._conn.execute("SELECT COUNT(*) FROM marcaciones").fetchone()
        return total

    def comando_aplicado(self, comando_id: int) -> bool:
        with self._lock:
            fila = self._conn.execute(
                "SELECT 1 FROM comandos_aplicados WHERE id = ?", (comando_id,)
            ).fetchone()
        return fila is not None

    def marcar_comando_aplicado(self, comando_id: int) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO comandos_aplicados (id) VALUES (?)", (comando_id,)
            )
            self._conn.commit()

    def cerrar(self) -> None:
        with self._lock:
            self._conn.close()
