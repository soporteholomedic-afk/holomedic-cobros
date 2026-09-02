"""Behavioral tests for the append-only SQLite buffer (T-F1-09R).

Spec: REQ-F1-05/06 — local durability for device punches. The buffer is
APPEND-ONLY: rows are inserted once and only ever flip estado
'pendiente' -> 'enviado'; no code path removes rows, so a worker restart
can never lose an unsent punch. Batches handed to the sender are capped
at 200 rows in stable id order. Command ids already applied are tracked
durably so command execution stays idempotent.
"""

import tempfile
import unittest
from pathlib import Path

from worker.buffer import BufferAsistencia


def item(user_id: str, minuto: int, punch: int = 0) -> dict:
    return {
        "user_id": user_id,
        "fecha_hora": f"2026-09-01T08:{minuto:02d}:00",
        "punch": punch,
        "tipo": "HUELLA",
    }


class BufferAsistenciaTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.ruta = str(Path(self._tmp.name) / "buffer.sqlite3")
        self.addCleanup(self._tmp.cleanup)

    def _buffer(self) -> BufferAsistencia:
        return BufferAsistencia(self.ruta)

    def test_toma_pendientes_en_orden_de_insercion(self):
        buf = self._buffer()
        buf.agregar_marcaciones(
            [item("U001", 1), item("U002", 2), item("U001", 3, punch=1)]
        )
        pendientes = buf.tomar_pendientes()
        self.assertEqual(
            [p["user_id"] for p in pendientes], ["U001", "U002", "U001"]
        )
        self.assertEqual(pendientes[2]["punch"], 1)
        self.assertEqual(pendientes[0]["fecha_hora"], "2026-09-01T08:01:00")
        self.assertEqual(pendientes[0]["tipo"], "HUELLA")

    def test_entrega_lotes_de_maximo_200_y_solo_avanza_al_marcar(self):
        buf = self._buffer()
        buf.agregar_marcaciones([item(f"U{n:03d}", n % 60) for n in range(450)])
        primer = buf.tomar_pendientes()
        self.assertEqual(len(primer), 200)
        self.assertEqual(primer[0]["user_id"], "U000")
        # While the batch is unmarked, the pending queue does not advance.
        self.assertEqual([p["id"] for p in buf.tomar_pendientes()],
                         [p["id"] for p in primer])
        buf.marcar_enviadas([p["id"] for p in primer])
        segundo = buf.tomar_pendientes()
        self.assertEqual(len(segundo), 200)
        self.assertEqual(segundo[0]["id"], primer[-1]["id"] + 1)
        buf.marcar_enviadas([p["id"] for p in segundo])
        resto = buf.tomar_pendientes()
        self.assertEqual(len(resto), 50)
        buf.marcar_enviadas([p["id"] for p in resto])
        self.assertEqual(buf.tomar_pendientes(), [])

    def test_marcar_enviadas_mantiene_las_filas(self):
        buf = self._buffer()
        buf.agregar_marcaciones([item("U001", 1), item("U002", 2)])
        ids = [p["id"] for p in buf.tomar_pendientes()]
        buf.marcar_enviadas(ids)
        # Queue drained (precondition: every row was marked)...
        self.assertEqual(buf.tomar_pendientes(), [])
        # ...but the rows REMAIN: the buffer never removes data.
        self.assertEqual(buf.total_filas(), 2)
        buf.agregar_marcaciones([item("U003", 5)])
        self.assertEqual(buf.total_filas(), 3)

    def test_sobrevive_reinicio_del_proceso(self):
        buf = self._buffer()
        buf.agregar_marcaciones([item("U001", 1), item("U002", 2)])
        ids = [p["id"] for p in buf.tomar_pendientes()]
        buf.marcar_enviadas(ids[:1])
        buf.cerrar()
        # The process "restarts": a fresh instance opens the same file.
        buf2 = self._buffer()
        pendientes = buf2.tomar_pendientes()
        self.assertEqual([p["user_id"] for p in pendientes], ["U002"])
        buf2.agregar_marcaciones([item("U003", 9)])
        self.assertEqual(buf2.total_filas(), 3)

    def test_registra_comandos_aplicados_de_forma_duradera(self):
        buf = self._buffer()
        self.assertFalse(buf.comando_aplicado(7))
        buf.marcar_comando_aplicado(7)
        self.assertTrue(buf.comando_aplicado(7))
        self.assertFalse(buf.comando_aplicado(8))
        buf.cerrar()
        buf2 = self._buffer()
        self.assertTrue(buf2.comando_aplicado(7))
        buf2.marcar_comando_aplicado(7)  # re-mark is a no-op, not a duplicate
        self.assertTrue(buf2.comando_aplicado(7))

    def test_agregar_lista_vacia_no_inserta_nada(self):
        buf = self._buffer()
        self.assertEqual(buf.agregar_marcaciones([]), 0)
        self.assertEqual(buf.total_filas(), 0)


if __name__ == "__main__":
    unittest.main()
