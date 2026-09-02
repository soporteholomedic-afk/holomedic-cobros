"""ZKTeco K20 Pro client — thin wrapper over pyzk (R1, R5, R6).

pyzk is imported LAZILY inside the connection methods: the worker runs
on the Linux server where pyzk is installed, while the validation
environment (python3 -m unittest) has neither a device nor pyzk —
importing this module must stay side-effect free.

Border rules (REQ-F1-07/08):
- get_users() projects ONLY (user_id, nombre); the raw device fields
  (handle, credential material, badge number) never cross the border.
- The device clock is read and re-synchronized at most ONCE per
  connection, right after connect; the measured drift feeds the
  heartbeat (DRIFT_RELOJ visibility on the dashboard, R6).
"""

from __future__ import annotations

import datetime

VERIFICACIONES = {1: "HUELLA", 3: "PIN", 4: "TARJETA"}
VERIFICACION_POR_DEFECTO = "HUELLA"


def mapear_verificacion(codigo: int) -> str:
    """Map the device verify code to the wire tipo_verificacion value."""
    return VERIFICACIONES.get(codigo, VERIFICACION_POR_DEFECTO)


def mapear_usuario(usuario) -> tuple[str, str]:
    """Project a pyzk user record to the wire pair (user_id, nombre).

    pyzk hands ``user_id`` over as a NUMBER on several device surfaces
    (K20 Pro realtime packets among them) — the wire ALWAYS carries it
    as a string.
    """
    return (str(usuario.user_id), usuario.name)


def mapear_marca(marca) -> dict:
    """Project a pyzk attendance record to the marcaciones wire item.

    The timestamp travels as a naive wall-clock string in the device's
    local time (America/Lima — ADR-9); no timezone conversion happens.
    """
    return {
        # K20 Pro realtime events hand user_id over as a NUMBER — the
        # wire payload NEVER carries a non-string user_id (server
        # rejects it: USER_ID_MAX/typeof check in the ingestion route).
        "user_id": str(marca.user_id),
        "fecha_hora": marca.timestamp.strftime("%Y-%m-%dT%H:%M:%S"),
        "punch": int(marca.punch),
        "tipo_verificacion": mapear_verificacion(int(marca.verify)),
    }


def calcular_drift(hora_equipo: datetime.datetime, ahora: datetime.datetime) -> float:
    """Signed seconds the DEVICE clock is ahead of the host clock."""
    return (hora_equipo - ahora).total_seconds()


class ZkClient:
    """Connection-scoped wrapper; every network call requires conectar()."""

    def __init__(self, ip: str, puerto: int = 4370, timeout_seg: int = 10):
        self._ip = ip
        self._puerto = puerto
        self._timeout_seg = timeout_seg
        self._conn = None
        self._drift_seg: float | None = None

    def conectar(self) -> float:
        """Open the single TCP session (R1), sync the clock once, measure drift.

        Returns the measured drift in seconds (device clock minus host
        clock) so the caller can report it on the next heartbeat.
        """
        from zk import ZK  # lazy import — see module docstring

        dispositivo = ZK(self._ip, port=self._puerto, timeout=self._timeout_seg)
        self._conn = dispositivo.connect()
        hora_equipo = self._conn.get_time()
        ahora = datetime.datetime.now()
        self._drift_seg = calcular_drift(hora_equipo, ahora)
        self._conn.set_time(ahora)
        return self._drift_seg

    @property
    def drift_seg(self) -> float | None:
        """Drift measured at connect time; None before the first conectar()."""
        return self._drift_seg

    def _exigir_conexion(self):
        if self._conn is None:
            raise RuntimeError("ZkClient: no hay conexión activa (llamar conectar())")
        return self._conn

    def live_capture(self, callback) -> None:
        """Stream live punches to ``callback`` as wire items (blocks)."""
        conn = self._exigir_conexion()
        for marca in conn.live_capture():
            if marca is None:
                continue  # pyzk emits None as a keep-alive ping
            callback(mapear_marca(marca))

    def get_users(self) -> list[tuple[str, str]]:
        """Wire projection only: [(user_id, nombre)] — see border rules."""
        conn = self._exigir_conexion()
        return [mapear_usuario(u) for u in conn.get_users()]

    def get_attendance(self) -> list[dict]:
        """Wire projection of every stored punch (daily pull)."""
        conn = self._exigir_conexion()
        return [mapear_marca(m) for m in conn.get_attendance()]

    def delete_user(self, user_id: str) -> None:
        conn = self._exigir_conexion()
        conn.delete_user(user_id=user_id)

    def set_time(self, hora: datetime.datetime | None = None) -> None:
        conn = self._exigir_conexion()
        conn.set_time(hora or datetime.datetime.now())

    def desconectar(self) -> None:
        if self._conn is not None:
            self._conn.disconnect()
            self._conn = None
