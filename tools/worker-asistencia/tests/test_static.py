"""Static AST rules + border contract tests for the worker package (ADR-8).

Two layers live here:

1. AST rules over ``worker/*.py`` — invariants the pyzk integration must
   never break (comments are invisible to the AST, only real code is
   judged):
   - ``clear_data`` (device wipe) is ABSENT from the whole package.
   - SQL string literals in ``buffer.py`` contain no destructive keyword:
     the buffer is append-only by construction.
   - The sensitive device fields are never referenced: ``get_users``
     projects ONLY (user_id, nombre) at the border.

2. Behavioral tests for the pure border functions (user/marca
   projection) and the environment config parsing.
"""

import ast
import datetime
import re
import unittest
from pathlib import Path

from worker.config import Config
from worker.zk_client import mapear_marca, mapear_usuario, mapear_verificacion

CAMPOS_PROHIBIDOS = {"uid", "password", "cardno"}
PAQUETE = Path(__file__).resolve().parent.parent / "worker"
RE_SQL_DESTRUCTIVO = re.compile(r"\b(DROP|DELETE|TRUNCATE|ALTER)\b", re.IGNORECASE)


def arboles_paquete() -> dict:
    """Parse every worker module; keyed by file name (e.g. 'buffer.py')."""
    return {
        ruta.name: ast.parse(ruta.read_text(encoding="utf-8"), filename=ruta.name)
        for ruta in sorted(PAQUETE.glob("*.py"))
    }


class PaquetePresenteTest(unittest.TestCase):
    def test_el_paquete_worker_tiene_los_modulos_base(self):
        nombres = set(arboles_paquete())
        self.assertIn("buffer.py", nombres)
        self.assertIn("zk_client.py", nombres)
        self.assertIn("config.py", nombres)


class ReglasAstTest(unittest.TestCase):
    def setUp(self):
        self.arboles = arboles_paquete()
        self.assertGreaterEqual(len(self.arboles), 3)

    def test_clear_data_ausente_en_todo_el_paquete(self):
        for nombre, arbol in self.arboles.items():
            for nodo in ast.walk(arbol):
                if isinstance(nodo, ast.Attribute):
                    self.assertNotEqual(
                        nodo.attr, "clear_data", f"{nombre}: clear_data prohibido"
                    )
                if isinstance(nodo, ast.Name):
                    self.assertNotEqual(
                        nodo.id, "clear_data", f"{nombre}: clear_data prohibido"
                    )
                if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
                    self.assertNotEqual(
                        nodo.value, "clear_data", f"{nombre}: clear_data prohibido"
                    )

    def test_sql_del_buffer_es_append_only(self):
        self.assertIn("buffer.py", self.arboles)
        for nodo in ast.walk(self.arboles["buffer.py"]):
            if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
                self.assertIsNone(
                    RE_SQL_DESTRUCTIVO.search(nodo.value),
                    f"buffer.py: literal SQL destructivo {nodo.value!r}",
                )

    def test_los_campos_sensibles_del_equipo_nunca_se_referencian(self):
        for nombre, arbol in self.arboles.items():
            for nodo in ast.walk(arbol):
                if isinstance(nodo, ast.Attribute):
                    self.assertNotIn(
                        nodo.attr,
                        CAMPOS_PROHIBIDOS,
                        f"{nombre}: atributo prohibido '{nodo.attr}'",
                    )
                if isinstance(nodo, ast.Name):
                    self.assertNotIn(
                        nodo.id,
                        CAMPOS_PROHIBIDOS,
                        f"{nombre}: identificador prohibido '{nodo.id}'",
                    )


class _UsuarioEquipo:
    """Fake of a pyzk user record: carries ALL the raw device fields."""

    def __init__(self):
        self.uid = "1"
        self.user_id = "001"
        self.name = "Ana Perez"
        self.password = ""
        self.cardno = 0
        self.privilege = 0


class _MarcaEquipo:
    """Fake of a pyzk attendance record."""

    def __init__(self, user_id, timestamp, punch=0, verify=1):
        self.user_id = user_id
        self.timestamp = timestamp
        self.punch = punch
        self.verify = verify


class FronteraUsuariosTest(unittest.TestCase):
    def test_mapear_usuario_solo_expone_id_y_nombre(self):
        proyeccion = mapear_usuario(_UsuarioEquipo())
        self.assertEqual(proyeccion, ("001", "Ana Perez"))
        self.assertEqual(len(proyeccion), 2)

    def test_mapear_usuario_triangula_con_otro_equipo(self):
        usuario = _UsuarioEquipo()
        usuario.user_id = "U99"
        usuario.name = "Bo"
        self.assertEqual(mapear_usuario(usuario), ("U99", "Bo"))


class FronteraMarcasTest(unittest.TestCase):
    def test_mapear_marca_produce_el_formato_wire(self):
        marca = _MarcaEquipo(
            "U001", datetime.datetime(2026, 9, 1, 8, 5, 0), punch=0, verify=1
        )
        self.assertEqual(
            mapear_marca(marca),
            {
                "user_id": "U001",
                "fecha_hora": "2026-09-01T08:05:00",
                "punch": 0,
                "tipo_verificacion": "HUELLA",
            },
        )

    def test_mapear_verificacion_cubre_tarjeta_pin_y_desconocido(self):
        self.assertEqual(mapear_verificacion(4), "TARJETA")
        self.assertEqual(mapear_verificacion(3), "PIN")
        self.assertEqual(mapear_verificacion(99), "HUELLA")  # conservative fallback


ENTORNO_BASE = {
    "DEVICE_IP": "192.168.1.50",
    "DEVICE_CODIGO": "K20-SEDE1",
    "API_BASE_URL": "https://holomedic.example/api/asistencia",
    "DEVICE_TOKEN": "secreto",
}


class ConfigTest(unittest.TestCase):
    def test_lee_valores_del_entorno(self):
        cfg = Config(dict(ENTORNO_BASE, HEARTBEAT_SEG="90", LOTE_MAX="150"))
        self.assertEqual(cfg.device_ip, "192.168.1.50")
        self.assertEqual(cfg.device_puerto, 4370)
        self.assertEqual(cfg.device_codigo, "K20-SEDE1")
        self.assertEqual(cfg.api_base_url, "https://holomedic.example/api/asistencia")
        self.assertEqual(cfg.device_token, "secreto")
        self.assertEqual(cfg.heartbeat_seg, 90)
        self.assertEqual(cfg.lote_max, 150)

    def test_defaults_operativos(self):
        cfg = Config(dict(ENTORNO_BASE))
        self.assertEqual(cfg.device_puerto, 4370)
        self.assertEqual(cfg.heartbeat_seg, 60)
        self.assertEqual(cfg.lote_max, 200)
        self.assertEqual(cfg.sender_intervalo_seg, 10)
        self.assertEqual(cfg.pull_hora, "02:30")
        self.assertEqual(cfg.backoff_base_seg, 5)
        self.assertEqual(cfg.backoff_max_seg, 300)
        self.assertEqual(cfg.db_path, "buffer.sqlite3")
        self.assertEqual(cfg.zona, "America/Lima")

    def test_api_base_url_sin_barra_final(self):
        cfg = Config(dict(ENTORNO_BASE, API_BASE_URL="https://x.example/api/"))
        self.assertEqual(cfg.api_base_url, "https://x.example/api")

    def test_falta_variable_requerida_falla_ruidoso(self):
        roto = dict(ENTORNO_BASE)
        del roto["DEVICE_TOKEN"]
        with self.assertRaises(ValueError) as ctx:
            Config(roto)
        self.assertIn("DEVICE_TOKEN", str(ctx.exception))

    def test_entero_invalido_falla_ruidoso(self):
        with self.assertRaises(ValueError):
            Config(dict(ENTORNO_BASE, HEARTBEAT_SEG="sesenta"))


if __name__ == "__main__":
    unittest.main()
