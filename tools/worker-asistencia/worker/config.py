"""Worker configuration from environment variables (12-factor).

Required: DEVICE_IP, DEVICE_CODIGO, API_BASE_URL, DEVICE_TOKEN — a
missing required variable fails LOUDLY at startup, never silently.
Optional integers have operational defaults matching the SDD design
(heartbeat 60s, lote 200, backoff min(5·2^n, 300)). The timezone is a
fixed constant (America/Lima, naive wall clock — ADR-9): the device,
the worker and SQL Server all live in the same wall clock.
"""

from __future__ import annotations

import os

ZONA = "America/Lima"

_REQUERIDAS = ("DEVICE_IP", "DEVICE_CODIGO", "API_BASE_URL", "DEVICE_TOKEN")


def _entero(entorno: dict, clave: str, por_defecto: int) -> int:
    bruto = entorno.get(clave)
    if bruto is None or bruto == "":
        return por_defecto
    try:
        return int(bruto)
    except ValueError as exc:
        raise ValueError(f"{clave} must be an integer, got {bruto!r}") from exc


class Config:
    """Parsed worker settings; pass ``entorno`` to build from a dict."""

    def __init__(self, entorno: dict | None = None):
        env = dict(os.environ if entorno is None else entorno)
        faltantes = [clave for clave in _REQUERIDAS if not env.get(clave)]
        if faltantes:
            raise ValueError(
                "Missing required environment variables: " + ", ".join(sorted(faltantes))
            )
        self.device_ip = env["DEVICE_IP"].strip()
        self.device_puerto = _entero(env, "DEVICE_PORT", 4370)
        self.device_codigo = env["DEVICE_CODIGO"].strip()
        self.api_base_url = env["API_BASE_URL"].strip().rstrip("/")
        self.device_token = env["DEVICE_TOKEN"].strip()
        self.db_path = env.get("DB_PATH") or "buffer.sqlite3"
        self.heartbeat_seg = _entero(env, "HEARTBEAT_SEG", 60)
        self.lote_max = _entero(env, "LOTE_MAX", 200)
        self.sender_intervalo_seg = _entero(env, "SENDER_INTERVALO_SEG", 10)
        self.pull_hora = env.get("PULL_HORA") or "02:30"
        self.backoff_base_seg = _entero(env, "BACKOFF_BASE_SEG", 5)
        self.backoff_max_seg = _entero(env, "BACKOFF_MAX_SEG", 300)
        self.zona = ZONA
