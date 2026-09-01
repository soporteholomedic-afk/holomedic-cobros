"""Device command executor (REQ-F1-04).

Commands ride the /marcaciones response (the server flips them
PENDIENTE -> ENVIADO). Execution is IDEMPOTENT: a command id already
recorded in the buffer's comandos_aplicados is skipped, so a crash
between apply and confirm can never double-apply. Only after a
successful apply is the command marked applied locally AND confirmed
to the server; a device failure leaves neither, so the next cycle
retries the whole command.
"""

from __future__ import annotations


class EjecutorComandos:
    def __init__(self, buffer, cliente_zk, api, pull=None):
        self._buffer = buffer
        self._zk = cliente_zk
        self._api = api
        self._pull = pull

    def procesar(self, comandos: list[dict]) -> None:
        for comando in comandos:
            self.aplicar(comando)

    def aplicar(self, comando: dict) -> bool:
        """Apply one command; False when it was already applied."""
        comando_id = int(comando["id"])
        if self._buffer.comando_aplicado(comando_id):
            return False
        self._ejecutar(comando)
        self._buffer.marcar_comando_aplicado(comando_id)
        self._api.confirmar(comando_id)
        return True

    def _ejecutar(self, comando: dict) -> None:
        tipo = comando["tipo"]
        payload = comando.get("payload")
        if tipo == "DESACTIVAR_USER":
            self._zk.delete_user(payload["user_id"])
        elif tipo == "SET_TIME":
            self._zk.set_time()
        elif tipo == "SYNC_COMPLETO":
            if self._pull is None:
                raise RuntimeError("SYNC_COMPLETO sin callback de pull")
            self._pull()
        else:
            raise ValueError(f"Tipo de comando desconocido: {tipo!r}")
