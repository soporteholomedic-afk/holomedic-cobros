"""HTTPS client for the asistencia-rrhh device API (Bearer auth).

Wire contracts (implemented server-side in T-F1-06/07/08, mirrored
EXACTLY here):
- POST /marcaciones  {codigo_dispositivo, marcaciones[1..500]} ->
  {recibidos, insertados, duplicados, comandos:[{id, tipo, payload}]}
- POST /heartbeat    {drift_seg?, usuarios?:[{user_id, nombre}]} ->
  {hora_servidor}
- POST /comandos/{id}/confirmar -> {ok, estado, confirmadoAt}

The worker sends batches of at most LOTE_MAX (200) items, splitting
longer lists into sequential sub-batches; the per-sub-batch responses
are aggregated so the sender sees a single result. ``enviar`` is the
transport seam (default: urllib) — validation injects a fake and never
opens a live socket.
"""

from __future__ import annotations

import json
import urllib.request

SUBLOTE_DEFECTO = 200
TIMEOUT_SEG = 15


def construir_encabezados(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


class ApiCliente:
    def __init__(
        self,
        base_url: str,
        token: str,
        codigo_dispositivo: str,
        lote_max: int = SUBLOTE_DEFECTO,
        enviar=None,
    ):
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._codigo = codigo_dispositivo
        self._lote_max = lote_max
        self._enviar = enviar or self._enviar_urllib

    def _enviar_urllib(self, ruta: str, payload: dict) -> dict:
        data = json.dumps(payload).encode("utf-8")
        peticion = urllib.request.Request(
            self._base_url + ruta,
            data=data,
            headers=construir_encabezados(self._token),
            method="POST",
        )
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_SEG) as respuesta:
            return json.loads(respuesta.read().decode("utf-8"))

    def enviar_marcaciones(self, marcaciones: list[dict]) -> dict:
        """Send punches in <= lote_max sub-batches, aggregating results."""
        agregado = {"recibidos": 0, "insertados": 0, "duplicados": 0, "comandos": []}
        for inicio in range(0, len(marcaciones), self._lote_max):
            sublote = marcaciones[inicio : inicio + self._lote_max]
            respuesta = self._enviar(
                "/marcaciones",
                {"codigo_dispositivo": self._codigo, "marcaciones": sublote},
            )
            agregado["recibidos"] += respuesta.get("recibidos", 0)
            agregado["insertados"] += respuesta.get("insertados", 0)
            agregado["duplicados"] += respuesta.get("duplicados", 0)
            agregado["comandos"].extend(respuesta.get("comandos", []))
        return agregado

    def heartbeat(self, drift_seg=None, usuarios=None) -> dict:
        payload: dict = {}
        if drift_seg is not None:
            payload["drift_seg"] = drift_seg
        if usuarios is not None:
            payload["usuarios"] = usuarios
        return self._enviar("/heartbeat", payload)

    def confirmar(self, comando_id: int) -> dict:
        return self._enviar(f"/comandos/{comando_id}/confirmar", {})
