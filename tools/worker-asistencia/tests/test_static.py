"""Static AST rules + border/contract tests for the worker package (ADR-8).

Three layers live here:

1. AST rules over ``worker/*.py`` — invariants the pyzk integration and
   the API client must never break (comments are invisible to the AST,
   only real code is judged):
   - ``clear_data`` (device wipe) is ABSENT from the whole package.
   - SQL string literals in ``buffer.py`` contain no destructive keyword:
     the buffer is append-only by construction.
   - The sensitive device fields are never referenced NOR embedded in
     payloads/logs anywhere: ``get_users`` projects ONLY (user_id,
     nombre) at the border, and no payload ever carries credential
     material or badge numbers.

2. Behavioral tests for the pure border functions (user/marca
   projection), the environment config parsing, the API client
   contract (Bearer header, batch splitting, routes) and the command
   executor idempotency.

3. Rollout invariants: the systemd unit must self-heal (Restart=always)
   and only start once the network is online.
"""

import ast
import datetime
import re
import tempfile
import unittest
from pathlib import Path

from worker.api_client import ApiCliente, construir_encabezados
from worker.comandos import EjecutorComandos
from worker.config import Config
from worker.main import calcular_backoff
from worker.buffer import BufferAsistencia
from worker.zk_client import mapear_marca, mapear_usuario, mapear_verificacion

CAMPOS_PROHIBIDOS = {"uid", "password", "cardno"}
PAQUETE = Path(__file__).resolve().parent.parent / "worker"
UNIT = Path(__file__).resolve().parent.parent / "systemd" / "worker-asistencia.service"
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

    def test_ningun_payload_o_log_lleva_campos_sensibles(self):
        """Neither string constants (payload keys, log templates, JSON)
        nor identifiers may ever name the sensitive device fields."""
        for nombre, arbol in self.arboles.items():
            for nodo in ast.walk(arbol):
                if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
                    self.assertNotIn(
                        nodo.value,
                        CAMPOS_PROHIBIDOS,
                        f"{nombre}: constante prohibida {nodo.value!r}",
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


class EncabezadosApiTest(unittest.TestCase):
    def test_encabezados_llevan_bearer_y_json(self):
        self.assertEqual(
            construir_encabezados("tok-123"),
            {
                "Authorization": "Bearer tok-123",
                "Content-Type": "application/json",
            },
        )


class _TransporteFalso:
    """Captures every (ruta, payload) POST the client would send."""

    def __init__(self, respuestas=None):
        self.llamadas = []
        self.respuestas = respuestas or []

    def __call__(self, ruta, payload):
        self.llamadas.append((ruta, payload))
        if self.respuestas:
            return self.respuestas[len(self.llamadas) - 1]
        return {}

    def rutas(self):
        return [ruta for ruta, _ in self.llamadas]

    def tamanos(self):
        return [len(payload["marcaciones"]) for _, payload in self.llamadas]


def _marcas_wire(cantidad: int) -> list:
    return [
        {
            "user_id": f"U{n % 40:03d}",
            "fecha_hora": f"2026-09-01T10:{n % 60:02d}:{n % 60:02d}",
            "punch": 0,
            "tipo_verificacion": "HUELLA",
        }
        for n in range(cantidad)
    ]


class ApiClienteMarcacionesTest(unittest.TestCase):
    def test_envia_lote_en_la_ruta_marcaciones(self):
        transporte = _TransporteFalso(
            [{"recibidos": 2, "insertados": 2, "duplicados": 0, "comandos": []}]
        )
        api = ApiCliente("https://x.example/api/asistencia", "tok", "K20-1", enviar=transporte)
        resultado = api.enviar_marcaciones(_marcas_wire(2))
        self.assertEqual(transporte.rutas(), ["/marcaciones"])
        self.assertEqual(resultado["recibidos"], 2)
        self.assertEqual(resultado["insertados"], 2)
        lote = transporte.llamadas[0][1]
        self.assertEqual(lote["codigo_dispositivo"], "K20-1")
        self.assertEqual(len(lote["marcaciones"]), 2)

    def test_lote_grande_se_trocea_en_sublotes_de_max_200(self):
        transporte = _TransporteFalso(
            [
                {"recibidos": 200, "insertados": 190, "duplicados": 10, "comandos": []},
                {"recibidos": 200, "insertados": 200, "duplicados": 0, "comandos": []},
                {"recibidos": 50, "insertados": 50, "duplicados": 0, "comandos": []},
            ]
        )
        api = ApiCliente("https://x.example/api/asistencia", "tok", "K20-1", enviar=transporte)
        resultado = api.enviar_marcaciones(_marcas_wire(450))
        self.assertEqual(transporte.tamanos(), [200, 200, 50])
        self.assertEqual(resultado["recibidos"], 450)
        self.assertEqual(resultado["insertados"], 440)
        self.assertEqual(resultado["duplicados"], 10)

    def test_comandos_de_todos_los_sublotes_se_acumulan(self):
        transporte = _TransporteFalso(
            [
                {"recibidos": 1, "insertados": 1, "duplicados": 0, "comandos": [{"id": 7, "tipo": "SET_TIME", "payload": None}]},
                {"recibidos": 1, "insertados": 1, "duplicados": 0, "comandos": [{"id": 8, "tipo": "SYNC_COMPLETO", "payload": None}]},
            ]
        )
        api = ApiCliente(
            "https://x.example/api/asistencia", "tok", "K20-1", lote_max=1, enviar=transporte
        )
        resultado = api.enviar_marcaciones(_marcas_wire(2))
        self.assertEqual(transporte.tamanos(), [1, 1])  # 2 sub-batches forced
        self.assertEqual([c["id"] for c in resultado["comandos"]], [7, 8])


class ApiClienteLatidoTest(unittest.TestCase):
    def test_latido_simple_no_envia_campos_opcionales(self):
        transporte = _TransporteFalso([{"hora_servidor": "2026-09-01T12:00:00"}])
        api = ApiCliente("https://x.example/api/asistencia", "tok", "K20-1", enviar=transporte)
        resultado = api.heartbeat()
        self.assertEqual(transporte.rutas(), ["/heartbeat"])
        self.assertEqual(transporte.llamadas[0][1], {})
        self.assertEqual(resultado["hora_servidor"], "2026-09-01T12:00:00")

    def test_latido_con_drift_y_usuarios(self):
        transporte = _TransporteFalso([{"hora_servidor": "2026-09-01T12:00:00"}])
        api = ApiCliente("https://x.example/api/asistencia", "tok", "K20-1", enviar=transporte)
        api.heartbeat(drift_seg=12.5, usuarios=[{"user_id": "001", "nombre": "Ana"}])
        self.assertEqual(
            transporte.llamadas[0][1],
            {
                "drift_seg": 12.5,
                "usuarios": [{"user_id": "001", "nombre": "Ana"}],
            },
        )


class ApiClienteConfirmarTest(unittest.TestCase):
    def test_confirmar_postea_en_la_ruta_del_comando(self):
        transporte = _TransporteFalso([{"ok": True, "estado": "CONFIRMADO", "confirmadoAt": None}])
        api = ApiCliente("https://x.example/api/asistencia", "tok", "K20-1", enviar=transporte)
        resultado = api.confirmar(41)
        self.assertEqual(transporte.rutas(), ["/comandos/41/confirmar"])
        self.assertTrue(resultado["ok"])


class _ZkFalso:
    def __init__(self):
        self.eliminados = []
        self.veces_set_time = 0
        self.veces_pull = 0

    def delete_user(self, user_id):
        self.eliminados.append(user_id)

    def set_time(self, hora=None):
        self.veces_set_time += 1


class _ApiFalsa:
    def __init__(self):
        self.confirmados = []

    def confirmar(self, comando_id):
        self.confirmados.append(comando_id)
        return {"ok": True, "estado": "CONFIRMADO", "confirmadoAt": None}


class EjecutorComandosTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.buffer = BufferAsistencia(str(Path(self._tmp.name) / "buffer.sqlite3"))
        self.zk = _ZkFalso()
        self.api = _ApiFalsa()

    def _ejecutor(self, pull=None) -> EjecutorComandos:
        return EjecutorComandos(self.buffer, self.zk, self.api, pull=pull)

    def test_desactivar_user_elimina_confirma_y_registra(self):
        ejecutor = self._ejecutor()
        aplicado = ejecutor.aplicar(
            {"id": 7, "tipo": "DESACTIVAR_USER", "payload": {"user_id": "U001"}}
        )
        self.assertTrue(aplicado)
        self.assertEqual(self.zk.eliminados, ["U001"])
        self.assertEqual(self.api.confirmados, [7])
        self.assertTrue(self.buffer.comando_aplicado(7))

    def test_comando_repetido_no_se_reaplica(self):
        ejecutor = self._ejecutor()
        comando = {"id": 7, "tipo": "DESACTIVAR_USER", "payload": {"user_id": "U001"}}
        self.assertTrue(ejecutor.aplicar(comando))
        self.assertFalse(ejecutor.aplicar(comando))
        self.assertEqual(self.zk.eliminados, ["U001"])  # applied ONCE
        self.assertEqual(self.api.confirmados, [7])  # re-confirm skipped too

    def test_set_time_ajusta_el_reloj(self):
        ejecutor = self._ejecutor()
        self.assertTrue(ejecutor.aplicar({"id": 9, "tipo": "SET_TIME", "payload": None}))
        self.assertEqual(self.zk.veces_set_time, 1)
        self.assertEqual(self.api.confirmados, [9])

    def test_sync_completo_ejecuta_el_pull(self):
        pulls = []
        ejecutor = self._ejecutor(pull=lambda: pulls.append(1))
        self.assertTrue(
            ejecutor.aplicar({"id": 11, "tipo": "SYNC_COMPLETO", "payload": None})
        )
        self.assertEqual(pulls, [1])
        self.assertTrue(self.buffer.comando_aplicado(11))

    def test_fallo_del_equipo_no_confirma_ni_registra(self):
        zk_roto = _ZkFalso()

        def delete_user(user_id):
            raise RuntimeError("device offline")

        zk_roto.delete_user = delete_user
        ejecutor = EjecutorComandos(self.buffer, zk_roto, self.api)
        with self.assertRaises(RuntimeError):
            ejecutor.aplicar(
                {"id": 13, "tipo": "DESACTIVAR_USER", "payload": {"user_id": "U9"}}
            )
        self.assertFalse(self.buffer.comando_aplicado(13))
        self.assertEqual(self.api.confirmados, [])

    def test_procesar_recorre_la_lista_en_orden(self):
        ejecutor = self._ejecutor()
        ejecutor.procesar(
            [
                {"id": 1, "tipo": "SET_TIME", "payload": None},
                {"id": 2, "tipo": "SET_TIME", "payload": None},
            ]
        )
        self.assertEqual(self.api.confirmados, [1, 2])
        self.assertEqual(self.zk.veces_set_time, 2)


class BackoffTest(unittest.TestCase):
    def test_serie_exponencial_con_techo_de_300(self):
        self.assertEqual(
            [calcular_backoff(n) for n in range(7)],
            [5, 10, 20, 40, 80, 160, 300],
        )

    def test_backoff_con_base_y_techo_personalizados(self):
        self.assertEqual(calcular_backoff(2, base=3, maximo=10), 10)
        self.assertEqual(calcular_backoff(0, base=3, maximo=100), 3)


class UnitSystemdTest(unittest.TestCase):
    def test_el_unit_existe(self):
        self.assertTrue(UNIT.is_file(), f"missing {UNIT}")

    def test_el_unit_se_autorepara_y_espera_la_red(self):
        contenido = UNIT.read_text(encoding="utf-8")
        self.assertIn("After=network-online.target", contenido)
        self.assertIn("Restart=always", contenido)
        self.assertIn("RestartSec=", contenido)
        self.assertIn("worker.main", contenido)
        self.assertIn("EnvironmentFile=", contenido)


if __name__ == "__main__":
    unittest.main()
