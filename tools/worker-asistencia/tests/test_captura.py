"""Runtime behavior tests for the device border (REQ-F1-05/07) — C1/W1/W2 remediation.

``test_static.py`` pins the AST/border contracts; this module exercises
real execution paths that AST rules cannot see:

- ``ZkClient.conectar()`` (C1 / REQ-F1-07 s1): connect → get_time →
  drift → set_time, exactly once per connection. pyzk is NOT installed
  in the validation environment, so the lazy ``from zk import ZK``
  inside ``conectar()`` is satisfied by injecting a fake ``zk`` module
  into ``sys.modules`` before the call and restoring the registry
  afterwards.
- ``calcular_drift`` (W2/S1): the pure signed-drift arithmetic feeding
  the heartbeat (DRIFT_RELOJ visibility on the dashboard).
- ``WorkerAsistencia.hilo_captura`` (W1 / REQ-F1-05 s1): the live
  wiring — conectar() owns the single TCP session, the users snapshot
  is refreshed, and ``live_capture`` punches flow through the REAL
  border projection into the SQLite buffer (keep-alive ``None`` pings
  must never enqueue a row).
- user_id normalization: the K20 Pro emits realtime 12-byte events
  where pyzk hands over ``user_id`` as a NUMBER; the border MUST put a
  string ``user_id`` on every wire payload.
"""

import datetime
import sys
import tempfile
import types
import unittest

from worker.buffer import BufferAsistencia
from worker.main import WorkerAsistencia
from worker.zk_client import (
    ZkClient,
    calcular_drift,
    mapear_marca,
    mapear_usuario,
)


class _RegistroLlamadas:
    """Call recorder for the fake pyzk surface."""

    def __init__(self):
        self.ip = None
        self.port = None
        self.timeout = None
        self.connects = 0
        self.desconexiones = 0
        self.get_times = 0
        self.set_times = []


def _instalar_zk_falso(
    registro,
    hora_equipo,
    usuarios=(),
    marcas=(),
    al_terminar=None,
    detener_tras_conexiones=None,
):
    """Inject a fake ``zk`` module into ``sys.modules``; returns a restore hook.

    ``usuarios`` are the device user records exposed by ``get_users``;
    ``marcas`` is the sequence the fake ``live_capture`` generator
    yields before invoking ``al_terminar`` (used by wiring tests to
    stop the capture loop without sleeping the backoff).
    ``detener_tras_conexiones`` is a safety valve: if the capture loop
    reconnects that many times (a broken pipeline retrying forever),
    ``al_terminar`` fires so the test fails fast instead of hanging.
    """

    class ConexionFalsa:
        def get_time(self):
            registro.get_times += 1
            return hora_equipo

        def set_time(self, hora):
            registro.set_times.append(hora)

        def get_users(self):
            return list(usuarios)

        def live_capture(self):
            def generador():
                for marca in marcas:
                    yield marca
                if al_terminar is not None:
                    al_terminar()

            return generador()

        def disconnect(self):
            registro.desconexiones += 1

    class ZKFalsa:
        def __init__(self, ip, port=None, timeout=None):
            registro.ip = ip
            registro.port = port
            registro.timeout = timeout

        def connect(self):
            registro.connects += 1
            if (
                detener_tras_conexiones is not None
                and registro.connects >= detener_tras_conexiones
                and al_terminar is not None
            ):
                al_terminar()
            return ConexionFalsa()

    modulo = types.ModuleType("zk")
    modulo.ZK = ZKFalsa
    anterior = sys.modules.get("zk")
    sys.modules["zk"] = modulo
    return lambda: _restaurar_zk(anterior)


def _restaurar_zk(anterior):
    if anterior is None:
        sys.modules.pop("zk", None)
    else:
        sys.modules["zk"] = anterior


class ConectarSincronizacionTest(unittest.TestCase):
    """REQ-F1-07 s1: the clock is re-synchronized once per connection."""

    def test_conectar_sincroniza_el_reloj_una_vez_y_devuelve_el_drift(self):
        hora_equipo = datetime.datetime.now() + datetime.timedelta(seconds=45)
        registro = _RegistroLlamadas()
        self.addCleanup(
            _instalar_zk_falso(registro, hora_equipo)
        )

        cliente = ZkClient("192.168.1.50", puerto=4370, timeout_seg=10)
        drift = cliente.conectar()

        self.assertEqual(registro.connects, 1)
        self.assertEqual(registro.get_times, 1)
        self.assertEqual(len(registro.set_times), 1)
        self.assertEqual(
            (registro.ip, registro.port, registro.timeout),
            ("192.168.1.50", 4370, 10),
        )
        # drift is measured against the SAME host instant pushed to the device
        self.assertEqual(
            drift, (hora_equipo - registro.set_times[0]).total_seconds()
        )
        self.assertAlmostEqual(drift, 45.0, delta=1.0)
        self.assertEqual(cliente.drift_seg, drift)

    def test_cada_reconexion_vuelve_a_sincronizar_una_vez(self):
        hora_equipo = datetime.datetime(2026, 9, 1, 12, 0, 0)
        registro = _RegistroLlamadas()
        self.addCleanup(
            _instalar_zk_falso(registro, hora_equipo)
        )

        cliente = ZkClient("192.168.1.50")
        cliente.conectar()
        cliente.desconectar()
        cliente.conectar()

        self.assertEqual(registro.connects, 2)
        self.assertEqual(len(registro.set_times), 2)
        for llamada in registro.set_times:
            self.assertIsInstance(llamada, datetime.datetime)


class CalcularDriftTest(unittest.TestCase):
    """Signed drift: positive when the device clock runs ahead of the host."""

    def test_equipo_adelantado_da_drift_positivo(self):
        ahora = datetime.datetime(2026, 9, 1, 12, 0, 0)
        equipo = ahora + datetime.timedelta(seconds=45)
        self.assertEqual(calcular_drift(equipo, ahora), 45.0)

    def test_equipo_atrasado_da_drift_negativo(self):
        ahora = datetime.datetime(2026, 9, 1, 12, 0, 0)
        equipo = ahora - datetime.timedelta(seconds=75)
        self.assertEqual(calcular_drift(equipo, ahora), -75.0)

    def test_relojes_iguales_dan_drift_cero(self):
        instante = datetime.datetime(2026, 9, 1, 12, 0, 0)
        self.assertEqual(calcular_drift(instante, instante), 0.0)


class WiringCapturaTest(unittest.TestCase):
    """REQ-F1-05 s1: live punches reach the buffer through the real border."""

    def test_hilo_captura_consume_live_capture_y_encola_en_el_buffer(self):
        hora_equipo = datetime.datetime(2026, 9, 1, 12, 0, 0)
        marcas = [
            # K20 Pro realtime events hand user_id over as a NUMBER
            types.SimpleNamespace(user_id=1042, timestamp=hora_equipo, punch=0, verify=1),
            None,  # pyzk keep-alive ping — must NOT enqueue
            types.SimpleNamespace(
                user_id=1042,
                timestamp=hora_equipo + datetime.timedelta(minutes=1),
                punch=1,
                verify=4,
            ),
        ]
        registro = _RegistroLlamadas()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)

        buffer = BufferAsistencia(f"{tmp.name}/buffer.db")
        self.addCleanup(buffer.cerrar)
        config = types.SimpleNamespace(
            db_path=f"{tmp.name}/buffer.db",
            device_ip="192.168.1.50",
            device_puerto=4370,
            api_base_url="https://holomedic.example",
            device_token="token-de-prueba",
            device_codigo="K20-01",
            lote_max=200,
            sender_intervalo_seg=10,
            heartbeat_seg=60,
            pull_hora="02:30",
            backoff_base_seg=0,  # a broken pipeline must fail the test, not sleep
            backoff_max_seg=300,
        )
        trabajador = WorkerAsistencia(config, buffer=buffer)
        self.addCleanup(
            _instalar_zk_falso(
                registro,
                hora_equipo,
                usuarios=[types.SimpleNamespace(user_id=1042, name="Ana Perez")],
                marcas=marcas,
                al_terminar=trabajador.pedir_detencion,
                detener_tras_conexiones=3,
            )
        )

        trabajador.hilo_captura()

        # the capture thread owns the single session: ONE connect, ONE clock
        # sync — 3 connects means the pipeline is broken and retrying
        self.assertEqual(registro.connects, 1)
        self.assertEqual(len(registro.set_times), 1)
        # drift measured at connect time feeds the heartbeat
        self.assertEqual(
            trabajador._drift_seg,
            (hora_equipo - registro.set_times[0]).total_seconds(),
        )
        # users snapshot refreshed for the heartbeat bootstrap
        self.assertEqual(trabajador._usuarios, [("1042", "Ana Perez")])
        # every REAL punch enqueued exactly once, in order; keep-alive skipped
        self.assertEqual(buffer.total_filas(), 2)
        pendientes = buffer.tomar_pendientes(10)
        self.assertEqual([p["user_id"] for p in pendientes], ["1042", "1042"])
        for fila in pendientes:
            self.assertIsInstance(fila["user_id"], str)
        self.assertEqual(
            [p["punch"] for p in pendientes],
            [0, 1],
        )


class NormalizacionUserIdTest(unittest.TestCase):
    """The wire payload NEVER carries a non-string user_id (K20 Pro emits ints)."""

    def test_mapear_marca_normaliza_user_id_numerico_a_string(self):
        marca = types.SimpleNamespace(
            user_id=1042,
            timestamp=datetime.datetime(2026, 9, 1, 12, 0, 0),
            punch=0,
            verify=1,
        )
        item = mapear_marca(marca)
        self.assertEqual(item["user_id"], "1042")
        self.assertIsInstance(item["user_id"], str)

    def test_mapear_usuario_normaliza_user_id_numerico_a_string(self):
        usuario = types.SimpleNamespace(user_id=1042, name="Ana Perez")
        user_id, nombre = mapear_usuario(usuario)
        self.assertEqual((user_id, nombre), ("1042", "Ana Perez"))
        self.assertIsInstance(user_id, str)


if __name__ == "__main__":
    unittest.main()
