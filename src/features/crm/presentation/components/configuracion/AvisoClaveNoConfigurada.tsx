'use client';

import { CLASES_AVISO_ERROR } from './estilos';

/**
 * AvisoClaveNoConfigurada (agente-ia-crm E5·T6) — blocking notice shown
 * when the server answered 503 CLAVE_NO_CONFIGURADA: secrets cannot be
 * saved until CRM_CONFIG_KEY is provisioned on the server.
 */

export function AvisoClaveNoConfigurada() {
  return (
    <p role="alert" className={CLASES_AVISO_ERROR}>
      <strong>No se pueden editar secretos.</strong> Falta provisionar la variable de entorno{' '}
      <code className="font-mono">CRM_CONFIG_KEY</code> en el servidor (o es inválida). Pide al equipo de sistemas que la
      configure; mientras tanto, los secretos no se pueden reemplazar ni quitar.
    </p>
  );
}
