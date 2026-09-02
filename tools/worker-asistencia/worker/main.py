"""Worker entrypoint — capture, sender, heartbeat and daily pull.

Thread topology (SDD design), adapted to the K20 Pro's single TCP
session constraint (R1):

- captura: OWNS the device session. Connects (clock sync + drift
  measured + users snapshot refreshed), then streams live punches into
  the buffer; reconnects with exponential backoff on any failure.
- sender (~10s): drains the pending queue in <= LOTE_MAX batches, POSTs
  to /marcaciones, marks the batch sent on success and processes the
  commands riding the response (idempotent executor). A failed POST
  leaves the batch 'pendiente' — server-side dedup absorbs re-sends.
- heartbeat (60s): HTTPS-only — reads the users snapshot (refreshed by
  the capture thread, the only device-session owner) and the last
  measured drift, POSTs them to /heartbeat.
- pull diario: at PULL_HORA runs a full attendance sweep (also the
  SYNC_COMPLETO command handler), appending every stored punch to the
  buffer; server-side dedup makes the overlap harmless.

Backoff: n consecutive failures wait min(base·2^n, cap) seconds
(defaults 5..300).
"""

from __future__ import annotations

import datetime
import logging
import signal
import threading

from worker.api_client import ApiCliente
from worker.buffer import BufferAsistencia
from worker.comandos import EjecutorComandos
from worker.config import Config
from worker.zk_client import ZkClient

log = logging.getLogger("worker-asistencia")


def calcular_backoff(fallos_consecutivos: int, base: int = 5, maximo: int = 300) -> int:
    return min(base * (2 ** fallos_consecutivos), maximo)


def segundos_hasta(hora_hh_mm: str, ahora: datetime.datetime) -> int:
    """Seconds until the next occurrence of a naive local 'HH:MM' time."""
    hora, minuto = (int(parte) for parte in hora_hh_mm.split(":", 1))
    objetivo = ahora.replace(hour=hora, minute=minuto, second=0, microsecond=0)
    if objetivo <= ahora:
        objetivo += datetime.timedelta(days=1)
    return max(1, int((objetivo - ahora).total_seconds()))


class WorkerAsistencia:
    def __init__(self, config: Config, zk=None, api=None, buffer=None):
        self.config = config
        self.buffer = buffer or BufferAsistencia(config.db_path)
        self.zk = zk or ZkClient(config.device_ip, config.device_puerto)
        self.api = api or ApiCliente(
            config.api_base_url,
            config.device_token,
            config.device_codigo,
            lote_max=config.lote_max,
        )
        self.detener = threading.Event()
        self._ejecutor = EjecutorComandos(self.buffer, self.zk, self.api, pull=self.pull_completo)
        self._drift_seg = None
        self._lock_usuarios = threading.Lock()
        self._usuarios: list[tuple[str, str]] = []

    # ── orquestación ──────────────────────────────────────────────────────
    def ejecutar(self) -> None:
        hilos = [
            threading.Thread(target=self.hilo_captura, name="captura", daemon=True),
            threading.Thread(target=self.hilo_sender, name="sender", daemon=True),
            threading.Thread(target=self.hilo_heartbeat, name="heartbeat", daemon=True),
            threading.Thread(target=self.hilo_pull_diario, name="pull", daemon=True),
        ]
        for hilo in hilos:
            hilo.start()
        for hilo in hilos:
            hilo.join()

    def pedir_detencion(self) -> None:
        self.detener.set()

    # ── captura (dueño de la sesión del equipo) ──────────────────────────
    def hilo_captura(self) -> None:
        fallos = 0
        while not self.detener.is_set():
            try:
                self._drift_seg = self.zk.conectar()
                fallos = 0
                self._refrescar_usuarios()
                self.zk.live_capture(self._capturar_marca)
            except Exception as exc:
                fallos += 1
                log.warning("captura: %s (reintento en %ss)", exc, calcular_backoff(fallos))
            finally:
                self.zk.desconectar()
            self.detener.wait(
                calcular_backoff(
                    fallos, self.config.backoff_base_seg, self.config.backoff_max_seg
                )
            )

    def _capturar_marca(self, marca: dict) -> None:
        self.buffer.agregar_marcaciones([marca])

    def _refrescar_usuarios(self) -> None:
        try:
            usuarios = self.zk.get_users()
        except Exception as exc:
            log.warning("captura: no se pudo refrescar usuarios: %s", exc)
            return
        with self._lock_usuarios:
            self._usuarios = usuarios
        log.info("captura: snapshot de usuarios actualizado (%s)", len(usuarios))

    # ── sender ────────────────────────────────────────────────────────────
    def hilo_sender(self) -> None:
        fallos = 0
        while not self.detener.is_set():
            self.detener.wait(self.config.sender_intervalo_seg)
            if self.detener.is_set():
                return
            pendientes = self.buffer.tomar_pendientes(self.config.lote_max)
            if not pendientes:
                continue
            try:
                resultado = self.api.enviar_marcaciones(pendientes)
            except Exception as exc:
                fallos += 1
                log.warning(
                    "sender: %s (lote queda pendiente; reintento en %ss)",
                    exc,
                    calcular_backoff(fallos, self.config.backoff_base_seg, self.config.backoff_max_seg),
                )
                continue
            if fallos:
                log.info("sender: recuperación tras %s fallos", fallos)
            fallos = 0
            self.buffer.marcar_enviadas([p["id"] for p in pendientes])
            log.info(
                "sender: recibidos=%s insertados=%s duplicados=%s",
                resultado.get("recibidos"),
                resultado.get("insertados"),
                resultado.get("duplicados"),
            )
            self._ejecutor.procesar(resultado.get("comandos", []))

    # ── heartbeat (solo HTTPS) ────────────────────────────────────────────
    def hilo_heartbeat(self) -> None:
        fallos = 0
        while not self.detener.is_set():
            try:
                with self._lock_usuarios:
                    usuarios = [
                        {"user_id": user_id, "nombre": nombre}
                        for user_id, nombre in self._usuarios
                    ]
                self.api.heartbeat(
                    drift_seg=self._drift_seg, usuarios=usuarios or None
                )
                fallos = 0
            except Exception as exc:
                fallos += 1
                log.warning("heartbeat: %s (fallos consecutivos=%s)", exc, fallos)
            self.detener.wait(self.config.heartbeat_seg)

    # ── pull diario / SYNC_COMPLETO ───────────────────────────────────────
    def hilo_pull_diario(self) -> None:
        while not self.detener.is_set():
            espera = segundos_hasta(self.config.pull_hora, datetime.datetime.now())
            if self.detener.wait(espera):
                return
            log.info("pull diario: iniciando barrido completo")
            self.pull_completo()

    def pull_completo(self) -> None:
        try:
            marcas = self.zk.get_attendance()
        except Exception as exc:
            log.warning("pull diario: %s (se reintenta al día siguiente)", exc)
            return
        self.buffer.agregar_marcaciones(marcas)
        log.info("pull diario: %s marcaciones al buffer", len(marcas))


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    config = Config()
    worker = WorkerAsistencia(config)
    signal.signal(signal.SIGTERM, lambda *_: worker.pedir_detencion())
    signal.signal(signal.SIGINT, lambda *_: worker.pedir_detencion())
    log.info(
        "worker iniciado: equipo=%s:%s codigo=%s api=%s",
        config.device_ip,
        config.device_puerto,
        config.device_codigo,
        config.api_base_url,
    )
    worker.ejecutar()


if __name__ == "__main__":
    main()
