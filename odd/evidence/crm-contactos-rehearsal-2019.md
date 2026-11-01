# CRM contactos — migration rehearsal on SQL Server 2019

- Date: 2026-10-31 (container clock 2026-11-01 UTC)
- Commit under test: HEAD `409b14e` (migrate.ts from de30a8d, unchanged since); old schema from `3ea38d5`.
- Server reported: `Microsoft SQL Server 2019 (RTM-CU18) (KB5017593) - 15.0.4261.1 (X64)`, Developer Edition (64-bit) on Linux (Ubuntu 20.04.5), image `mcr.microsoft.com/mssql/server:2019-CU18-ubuntu-20.04`. Major version 15.0, same as the shared HOLOMEDIC server (15.0.2180.2 RTM); the build is newer (CU18 vs RTM), the engine major and the database compatibility level (150, set on every database) are the same.
- Throwaway container `crm-rehearsal-2019`, bound to 127.0.0.1:14339. The shared server (172.16.10.14) and `holomedic-dev-sql` were not touched.
- Method: the real `migrate(pool)` (mssql `batch()`) from HEAD and from 3ea38d5, and the real `SqlServerCrmEmpresaRepository` from HEAD, transpiled with the TypeScript compiler (no repository code changed). Schema read back from sys.columns, sys.check_constraints, sys.indexes, sys.foreign_keys; auto-generated constraint-name suffixes are normalized (`<auto>`).

## Summary

| Scenario | PASS | FAIL |
|---|---|---|
| (a) Fresh database | 19 | 0 |
| (b) Second run (idempotency) | 7 | 0 |
| (c) Upgrade from 3ea38d5 with LIVE-like data | 10 | 0 |
| (d) Partial state (CK_CrmEmpresa_medio dropped) | 5 | 0 |
| (e) Forced failure (duplicate RUCs) | 7 | 0 |
| (f) Application lock held — driver default timeout (15 s) | 5 | 0 |
| (f) Application lock held — requestTimeout 60 s (reaches the THROW) | 5 | 0 |
| (g) Repository smoke on the upgraded DB of (c) | 35 | 1 |

All migration checks (a–f) pass. Open question from de30a8d answered: **`CK_CrmEmpresa_ruc` survives `ALTER COLUMN ruc VARCHAR(11) NULL` on SQL Server 2019** (same definition, enabled, trusted), so no drop/recreate is needed.

One FAIL, in an extra probe of (g) that goes beyond the requested checks: see "FAIL details".

## Checks

### (a) Fresh database

| Result | Check | Observed |
|---|---|---|
| PASS | 4 tables created | {"CrmSector":6,"CrmEmpresa":0,"CrmContacto":0,"CrmInteraccion":0} |
| PASS | 6 sectors seeded | 6 |
| PASS | schema: ruc NULL-able VARCHAR(11) |  |
| PASS | schema: CK_CrmEmpresa_ruc present |  |
| PASS | schema: CK_CrmEmpresa_medio includes 'otro' |  |
| PASS | schema: UX_CrmEmpresa_ruc filtered unique, no UQ_CrmEmpresa_ruc |  |
| PASS | 8 new CrmEmpresa columns |  |
| PASS | schema: CrmContacto nombre/telefono NULL-able |  |
| PASS | schema: FK_CrmInteraccion_empresa cascade |  |
| PASS | schema: FK_CrmContacto_empresa cascade + FK_CrmEmpresa_sector |  |
| PASS | schema: IX_CrmInteraccion_empresa (idEmpresa,fecha DESC) |  |
| PASS | two NULL RUCs accepted | no error |
| PASS | duplicate RUC rejected (2601) | RequestError code=EREQUEST number=2601 class=14 state=1 line=1 proc= :: Cannot insert duplicate key row in object 'dbo.CrmEmpresa' with unique index 'UX_CrmEmpresa_ruc'. The duplicate key value is (20111111111). |
| PASS | 10-digit RUC rejected (547) | RequestError code=EREQUEST number=547 class=16 state= line=1 proc= :: The INSERT statement conflicted with the CHECK constraint "CK_CrmEmpresa_ruc". The conflict occurred in database "crm_r19_a", table "dbo.CrmEmpresa", column 'ruc'. |
| PASS | medio 'otro' accepted | no error |
| PASS | medio 'fax' rejected (547) | RequestError code=EREQUEST number=547 class=16 state= line=1 proc= :: The INSERT statement conflicted with the CHECK constraint "CK_CrmEmpresa_medio". The conflict occurred in database "crm_r19_a", table "dbo.CrmEmpresa", column 'medio'. |
| PASS | contact with only an email accepted | no error |
| PASS | interactions inserted | no error |
| PASS | deleting empresa cascades its interactions (others untouched) | {"a":0,"b":1} no error |

### (b) Second run (idempotency)

| Result | Check | Observed |
|---|---|---|
| PASS | second migrate runs without error | no error |
| PASS | schema identical to first run |  |
| PASS | schema identical to (a) fresh |  |
| PASS | modify_date unchanged on every object | 31 objects compared |
| PASS | no duplicate seed (6 sectors, same names) | {"CrmSector":6,"CrmEmpresa":0,"CrmContacto":0,"CrmInteraccion":0} |
| PASS | @@TRANCOUNT 0 afterwards | 0/0 |
| PASS | @@TRANCOUNT 0 on the very connection that ran migrate (pool max 1, 2 more runs) | {"t":0,"s":59} |

### (c) Upgrade from 3ea38d5 with LIVE-like data

| Result | Check | Observed |
|---|---|---|
| PASS | old schema seeded like LIVE (7 sectors, 1 empresa, 1 contact) | {"CrmSector":7,"CrmEmpresa":1,"CrmContacto":1,"CrmInteraccion":null} |
| PASS | new migrate succeeds on 3ea38d5 schema | no error |
| PASS | data kept (7 sectors, 1 empresa por_contactar RUC 20123456789, 1 principal contact) | {"c1":{"CrmSector":7,"CrmEmpresa":1,"CrmContacto":1,"CrmInteraccion":0},"emp":[{"idEmpresa":"live-1","razonSocial":"Empresa Viva SAC","ruc":"20123456789","etapa":"por_contactar","medio":null}],"con":[{"idEmpresa":"live-1","nombre":"Ana Pérez","telefono":"98765 |
| PASS | schema equal to (a) (ignoring column ordinal positions) |  |
| PASS | CK_CrmEmpresa_ruc survives ALTER COLUMN ruc NULL (same definition, enabled, trusted) | {"ckBefore":"([ruc] like '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')","ckAfter":{"d":"([ruc] like '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')","dis":false,"nt":false}} |
| PASS | ruc is now NULL-able |  |
| PASS | after upgrade: 10-digit RUC still rejected (547) | RequestError code=EREQUEST number=547 class=16 state= line=1 proc= :: The INSERT statement conflicted with the CHECK constraint "CK_CrmEmpresa_ruc". The conflict occurred in database "crm_r19_c", table "dbo.CrmEmpresa", column 'ruc'. |
| PASS | after upgrade: duplicate of live RUC rejected (2601) | RequestError code=EREQUEST number=2601 class=14 state=1 line=1 proc= :: Cannot insert duplicate key row in object 'dbo.CrmEmpresa' with unique index 'UX_CrmEmpresa_ruc'. The duplicate key value is (20123456789). |
| PASS | after upgrade: two NULL RUCs accepted | no error |
| PASS | @@TRANCOUNT 0 |  |

### (d) Partial state (CK_CrmEmpresa_medio dropped)

| Result | Check | Observed |
|---|---|---|
| PASS | precondition: CK_CrmEmpresa_medio dropped |  |
| PASS | migrate succeeds from partial state | no error |
| PASS | CK_CrmEmpresa_medio is back and includes 'otro' | {"d":"([medio]='otro' OR [medio]='whatsapp' OR [medio]='correo' OR [medio]='llamada')","nt":false,"dis":false} |
| PASS | schema equal to (a) (ignoring ordinals) |  |
| PASS | behavior: 'fax' rejected (547), 'otro' accepted | RequestError code=EREQUEST number=547 class=16 state= line=1 proc= :: The INSERT statement conflicted with the CHECK constraint "CK_CrmEmpresa_medio". The conflict occurred in database "crm_r19_d", table "dbo.CrmEmpresa", column 'medio'. \| no error |

### (e) Forced failure (duplicate RUCs)

| Result | Check | Observed |
|---|---|---|
| PASS | migrate FAILS with duplicate RUCs | RequestError code=EREQUEST number=1505 class=16 state=1 line=83 proc= :: The CREATE UNIQUE INDEX statement terminated because a duplicate key was found for the object name 'dbo.CrmEmpresa' and the index name 'UX_CrmEmpresa_ruc'. The duplicate key value is (209 |
| PASS | schema exactly the pre-migrate one (incl. column ordinals) |  |
| PASS | modify_date unchanged on every object |  |
| PASS | ruc still NOT NULL | COL CrmEmpresa.ruc #3 varchar(11,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS |
| PASS | no UX_CrmEmpresa_ruc, no CrmInteraccion, no new columns |  |
| PASS | row counts unchanged and rows identical | {"CrmSector":7,"CrmEmpresa":3,"CrmContacto":1,"CrmInteraccion":null} |
| PASS | @@TRANCOUNT 0 on the same connection; no app lock held | trancount=0 applocks=0 |

### (f) Application lock held — driver default timeout (15 s)

| Result | Check | Observed |
|---|---|---|
| PASS | migrate fails while another session holds the lock (default requestTimeout 15000 (driver default, as the app runs)) | after 15.0s :: RequestError code=ETIMEOUT number=ETIMEOUT class= state= line= proc= :: Timeout: Request failed to complete in 15000ms |
| PASS | no open transaction on the migrating connection, no waiter left | trancount=0 waiters=0 |
| PASS | nothing changed (schema, modify_date, counts) |  |
| PASS | after the lock is released, migrate succeeds and schema equals (a) | no error |
| PASS | data kept after the post-lock migrate |  |

### (f) Application lock held — requestTimeout 60 s (reaches the THROW)

| Result | Check | Observed |
|---|---|---|
| PASS | migrate fails while another session holds the lock (requestTimeout 60000 (to reach the 30 s lock THROW)) | after 30.1s :: RequestError code=EREQUEST number=50001 class=16 state=1 line=9 proc= :: CRM migration: could not get the application lock |
| PASS | no open transaction on the migrating connection, no waiter left | trancount=0 waiters=0 |
| PASS | nothing changed (schema, modify_date, counts) |  |
| PASS | after the lock is released, migrate succeeds and schema equals (a) | no error |
| PASS | data kept after the post-lock migrate |  |

### (g) Repository smoke on the upgraded DB of (c)

| Result | Check | Observed |
|---|---|---|
| PASS | create stores origen + NULL ruc + email-only contact (read back) | {"idEmpresa":"c1b8e599-a450-4bfc-b60f-34c138c1f09b","razonSocial":"Inbound SAC","ruc":null,"sector":"Construcción","notas":"nota A","etapa":"por_contactar","medio":null,"medioOtro":null,"motivo":null,"intentosSinRespuesta":0,"faltaResponderDesde":null,"proxima |
| PASS | create without origen leaves origen NULL |  |
| PASS | create duplicate RUC -> RucDuplicadoError (2601 mapped) | RucDuplicadoError: Ya existe una empresa con el RUC: 20555555555 |
| PASS | create: no leaked transaction after duplicate |  |
| PASS | updateSeguimiento writes state + date column | {"idEmpresa":"c1b8e599-a450-4bfc-b60f-34c138c1f09b","razonSocial":"Inbound SAC","ruc":null,"sector":"Construcción","notas":"nota A","etapa":"contactado","medio":"llamada","medioOtro":null,"motivo":null,"intentosSinRespuesta":1,"faltaResponderDesde":"2026-10-31 |
| PASS | updateSeguimiento inserted the interaction in the same call |  |
| PASS | updateSeguimiento is one transaction: failing interaction INSERT rolls back the UPDATE | RequestError code=EREQUEST number=547 class=16 state= line=18 proc= :: The INSERT statement conflicted with the CHECK constraint "CK_CrmInteraccion_medio". The conflict occurred in database "crm_r19_c", table "dbo.CrmInteraccion", column 'medio'. attempts=1 in |
| PASS | updateSeguimiento with null interaction and null next action |  |
| PASS | updateSeguimiento unknown empresa -> EmpresaNotFoundError (50404) | EmpresaNotFoundError: Empresa not found: no-existe |
| PASS | updateSeguimiento unknown empresa leaves no transaction open |  |
| PASS | listInteracciones newest first, ties by id DESC | ["nuevo-empate","nuevo","primer intento","viejo"] |
| PASS | listInteracciones maps fields (ISO fecha, nulls) |  |
| PASS | addInteraccion returns the inserted row (OUTPUT) | {"idInteraccion":6,"idEmpresa":"c1b8e599-a450-4bfc-b60f-34c138c1f09b","fecha":"2026-11-01T04:53:51.322Z","idUsuario":"u1","nombreUsuario":"Usuario Uno","direccion":"saliente","medio":"otro","medioOtro":"Visita","resultado":"conversamos","resumen":"ok"} |
| PASS | addInteraccion on unknown empresa -> EmpresaNotFoundError (FK 547 mapped) | EmpresaNotFoundError: Empresa not found: empresa-fantasma |
| PASS | addInteraccion CHECK violation (547 on existing empresa) is NOT mapped to not-found? | info: EmpresaNotFoundError undefined |
| FAIL | addInteraccion: a CHECK 547 (bad resultado) is reported as EmpresaNotFound (mis-mapping) | EmpresaNotFoundError code= number= class= state= line= proc= :: Empresa not found: c1b8e599-a450-4bfc-b60f-34c138c1f09b |
| PASS | updateEstado keeps medioOtro when medio stays 'otro' | {"m":"otro","o":"Visita"} |
| PASS | updateEstado clears medioOtro when medio changes | {"m":"correo","o":null} |
| PASS | updateEstado to perdido with motivo, medioOtro cleared |  |
| PASS | updateEstado: coming back to 'otro' has no stale detail | {"o":null} |
| PASS | updateEstado unknown id -> EmpresaNotFoundError |  |
| PASS | fusionar returns the destination | {"id":"live-1","ruc":"20123456789"} |
| PASS | fusionar joins notes (destination, blank line, origin) | "nota destino\n\nnota origen" |
| PASS | fusionar dedups the identical contact; keeps 3 (Ana once, Beto, email-only) | ["Ana Pérez\|987654321\|ana@viva.pe","Beto\|955555555\|null","null\|null\|solo@x.pe"] |
| PASS | fusionar keeps destination's principal first |  |
| PASS | fusionar leaves exactly one principal | 1 |
| PASS | fusionar deleted the origin (and no contact rows orphaned) | {"e":0,"c":0} |
| PASS | fusionar moved the origin interactions to the destination (not cascaded away) | ["d1","o1","o2"] |
| PASS | fusionar no open transaction |  |
| PASS | fusionar notes: dest NULL -> origin notes; equal -> not duplicated; origin NULL -> dest kept | ["solo origen","igual","solo destino"] |
| PASS | fusionar: non-duplicate origin contact is appended after the principal |  |
| PASS | fusionar missing destination -> error 50405 -> EmpresaNotFoundError(destino id) | EmpresaNotFoundError: Empresa not found: destino-fantasma |
| PASS | fusionar missing destination: origin untouched, no transaction left |  |
| PASS | fusionar missing origin (50404) -> EmpresaNotFoundError(origen id) | EmpresaNotFoundError: Empresa not found: origen-fantasma |
| PASS | fusionar self-merge -> DatosEmpresaInvalidosError |  |
| PASS | raw SQL error number of the destination THROW is 50405 (number property) | RequestError code=EREQUEST number=50405 class=16 state=1 line=1 proc= :: empresa de destino no encontrada |

## (c) Schema diff before / after the new migrate

Before = schema created by the 3ea38d5 `migrate` plus LIVE-like data (7 sectors, 1 empresa `por_contactar` with RUC 20123456789, 1 principal contact). After = the same database after the HEAD `migrate`. Column `#n` is the ordinal position (new columns are appended, so (c) equals (a) except for ordinals; the comparison with (a) ignores them). `<auto>` = system-generated name suffix.

```diff
--- before (3ea38d5 schema)
+++ after (new migrate)
@@ -2,38 +2,64 @@
 COL CrmContacto.esPrincipal #6 bit(1,1,0) null=false ident=false coll=null DEFAULT DF__CrmContac__esPri__<auto> ((0))
 COL CrmContacto.idContacto #1 int(4,10,0) null=false ident=true coll=null
 COL CrmContacto.idEmpresa #2 nvarchar(100,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
-COL CrmContacto.nombre #3 nvarchar(400,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmContacto.nombre #3 nvarchar(400,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmContacto.orden #7 int(4,10,0) null=false ident=false coll=null DEFAULT DF__CrmContac__orden__<auto> ((0))
-COL CrmContacto.telefono #4 nvarchar(100,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmContacto.telefono #4 nvarchar(100,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.createdAt #12 datetime2(7,23,3) null=false ident=false coll=null DEFAULT DF__CrmEmpres__creat__<auto> (sysutcdatetime())
 COL CrmEmpresa.etapa #6 nvarchar(40,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS DEFAULT DF__CrmEmpres__etapa__<auto> ('por_contactar')
+COL CrmEmpresa.faltaResponderDesde #16 datetime2(7,23,3) null=true ident=false coll=null
 COL CrmEmpresa.idEmpresa #1 nvarchar(100,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.idSector #4 int(4,10,0) null=true ident=false coll=null
+COL CrmEmpresa.intentosSinRespuesta #15 int(4,10,0) null=false ident=false coll=null DEFAULT DF_CrmEmpresa_intentosSinRespuesta ((0))
 COL CrmEmpresa.medio #7 nvarchar(20,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmEmpresa.medioOtro #14 nvarchar(80,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.motivoCategoria #8 nvarchar(40,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.motivoDetalle1 #9 nvarchar(400,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.motivoDetalle2 #10 nvarchar(400,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.motivoNotas #11 nvarchar(600,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.notas #5 nvarchar(-1,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmEmpresa.origen #20 nvarchar(40,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmEmpresa.proximaAccionDetalle #18 nvarchar(160,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmEmpresa.proximaAccionFecha #19 date(3,10,0) null=true ident=false coll=null
+COL CrmEmpresa.proximaAccionTipo #17 nvarchar(40,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmEmpresa.razonSocial #2 nvarchar(400,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
-COL CrmEmpresa.ruc #3 varchar(11,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmEmpresa.ruc #3 varchar(11,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmEmpresa.sugerenciaDescartadaEn #21 int(4,10,0) null=true ident=false coll=null
 COL CrmEmpresa.updatedAt #13 datetime2(7,23,3) null=false ident=false coll=null DEFAULT DF__CrmEmpres__updat__<auto> (sysutcdatetime())
+COL CrmInteraccion.direccion #6 nvarchar(20,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.fecha #3 datetime2(7,23,3) null=false ident=false coll=null DEFAULT DF__CrmIntera__fecha__<auto> (sysutcdatetime())
+COL CrmInteraccion.idEmpresa #2 nvarchar(100,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.idInteraccion #1 int(4,10,0) null=false ident=true coll=null
+COL CrmInteraccion.idUsuario #4 nvarchar(100,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.medio #7 nvarchar(20,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.medioOtro #8 nvarchar(80,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.nombreUsuario #5 nvarchar(400,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.resultado #9 nvarchar(40,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
+COL CrmInteraccion.resumen #10 nvarchar(2000,0,0) null=true ident=false coll=SQL_Latin1_General_CP1_CI_AS
 COL CrmSector.createdAt #3 datetime2(7,23,3) null=false ident=false coll=null DEFAULT DF__CrmSector__creat__<auto> (sysutcdatetime())
 COL CrmSector.idSector #1 int(4,10,0) null=false ident=true coll=null
 COL CrmSector.nombre #2 nvarchar(100,0,0) null=false ident=false coll=SQL_Latin1_General_CP1_CI_AS
 CHK CrmEmpresa.CK_CrmEmpresa_etapa ([etapa]='perdido' OR [etapa]='cliente' OR [etapa]='en_seguimiento' OR [etapa]='contactado' OR [etapa]='por_contactar') disabled=false not_trusted=false
-CHK CrmEmpresa.CK_CrmEmpresa_medio ([medio]='whatsapp' OR [medio]='correo' OR [medio]='llamada') disabled=false not_trusted=false
+CHK CrmEmpresa.CK_CrmEmpresa_medio ([medio]='otro' OR [medio]='whatsapp' OR [medio]='correo' OR [medio]='llamada') disabled=false not_trusted=false
 CHK CrmEmpresa.CK_CrmEmpresa_medioEtapa ([etapa]<>'por_contactar' OR [medio] IS NULL) disabled=false not_trusted=false
 CHK CrmEmpresa.CK_CrmEmpresa_motivo ([etapa]='perdido' AND [motivoCategoria] IS NOT NULL OR [etapa]<>'perdido' AND [motivoCategoria] IS NULL) disabled=false not_trusted=false
 CHK CrmEmpresa.CK_CrmEmpresa_motivoCategoria ([motivoCategoria]='otro' OR [motivoCategoria]='no_contestan' OR [motivoCategoria]='sin_interes' OR [motivoCategoria]='proveedor' OR [motivoCategoria]='precio') disabled=false not_trusted=false
+CHK CrmEmpresa.CK_CrmEmpresa_origen ([origen]='internet' OR [origen]='conocia' OR [origen]='referido' OR [origen]='nose') disabled=false not_trusted=false
+CHK CrmEmpresa.CK_CrmEmpresa_proximaAccionTipo ([proximaAccionTipo]='otro' OR [proximaAccionTipo]='reunion' OR [proximaAccionTipo]='whatsapp' OR [proximaAccionTipo]='info' OR [proximaAccionTipo]='cotizar' OR [proximaAccionTipo]='llamar' OR [proximaAccionTipo]='responder') disabled=false not_trusted=false
 CHK CrmEmpresa.CK_CrmEmpresa_ruc ([ruc] like '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]') disabled=false not_trusted=false
+CHK CrmInteraccion.CK_CrmInteraccion_direccion ([direccion]='entrante' OR [direccion]='saliente') disabled=false not_trusted=false
+CHK CrmInteraccion.CK_CrmInteraccion_medio ([medio]='otro' OR [medio]='whatsapp' OR [medio]='correo' OR [medio]='llamada') disabled=false not_trusted=false
+CHK CrmInteraccion.CK_CrmInteraccion_resultado ([resultado]='respondido' OR [resultado]='pendiente' OR [resultado]='deje_mensaje' OR [resultado]='no_contesto' OR [resultado]='conversamos') disabled=false not_trusted=false
 IDX CrmContacto.IX_CrmContacto_empresa NONCLUSTERED unique=false pk=false uq=false filter=null cols=(idEmpresa,orden)
 IDX CrmContacto.PK__CrmConta__<auto> CLUSTERED unique=true pk=true uq=false filter=null cols=(idContacto)
 IDX CrmContacto.UX_CrmContacto_principal NONCLUSTERED unique=true pk=false uq=false filter=([esPrincipal]=(1)) cols=(idEmpresa)
 IDX CrmEmpresa.PK__CrmEmpre__<auto> CLUSTERED unique=true pk=true uq=false filter=null cols=(idEmpresa)
-IDX CrmEmpresa.UQ_CrmEmpresa_ruc NONCLUSTERED unique=true pk=false uq=true filter=null cols=(ruc)
+IDX CrmEmpresa.UX_CrmEmpresa_ruc NONCLUSTERED unique=true pk=false uq=false filter=([ruc] IS NOT NULL) cols=(ruc)
+IDX CrmInteraccion.IX_CrmInteraccion_empresa NONCLUSTERED unique=false pk=false uq=false filter=null cols=(idEmpresa,fecha DESC)
+IDX CrmInteraccion.PK__CrmInter__<auto> CLUSTERED unique=true pk=true uq=false filter=null cols=(idInteraccion)
 IDX CrmSector.PK__CrmSecto__<auto> CLUSTERED unique=true pk=true uq=false filter=null cols=(idSector)
 IDX CrmSector.UQ_CrmSector_nombre NONCLUSTERED unique=true pk=false uq=true filter=null cols=(nombre)
 FK FK_CrmContacto_empresa CrmContacto->CrmEmpresa (idEmpresa-&gt;idEmpresa) on_delete=CASCADE disabled=false not_trusted=false
 FK FK_CrmEmpresa_sector CrmEmpresa->CrmSector (idSector-&gt;idSector) on_delete=NO_ACTION disabled=false not_trusted=false
-TABLES CrmContacto,CrmEmpresa,CrmSector
+FK FK_CrmInteraccion_empresa CrmInteraccion->CrmEmpresa (idEmpresa-&gt;idEmpresa) on_delete=CASCADE disabled=false not_trusted=false
+TABLES CrmContacto,CrmEmpresa,CrmInteraccion,CrmSector
```

`CK_CrmEmpresa_ruc` before: `([ruc] like '[0-9]x11')`; after: identical, `is_disabled=0`, `is_not_trusted=0`. Data kept: 7 sectors, 1 empresa (RUC 20123456789, por_contactar), 1 contact (principal, Ana Pérez), 0 interactions.

## (e) Exact error — forced failure

Setup: 3ea38d5 schema, `UQ_CrmEmpresa_ruc` dropped, two empresas with RUC 20999999999. Migrate (HEAD) on one connection:

```
RequestError code=EREQUEST number=1505 class=16 state=1 line=83 proc= :: The CREATE UNIQUE INDEX statement terminated because a duplicate key was found for the object name 'dbo.CrmEmpresa' and the index name 'UX_CrmEmpresa_ruc'. The duplicate key value is (20999999999).
```

The failing statement is `CREATE UNIQUE INDEX UX_CrmEmpresa_ruc ON dbo.CrmEmpresa (ruc) WHERE ruc IS NOT NULL;` (line 83 of the batch). Afterwards, on the same connection: schema identical to the pre-migrate one (including column ordinals), `modify_date` unchanged on every object, ruc still NOT NULL, no UX index, no CrmInteraccion, no new columns, row counts unchanged (CrmSector 7, CrmEmpresa 3, CrmContacto 1), `@@TRANCOUNT` 0, no application lock held.

## (f) Exact errors — lock held by another session

Another session held `sp_getapplock 'crm-migrate'` (Exclusive, transaction owner) while migrate ran from a second connection.

```
[default requestTimeout 15000 (driver default, as the app runs)] after 15.0s: RequestError code=ETIMEOUT number=ETIMEOUT class= state= line= proc= :: Timeout: Request failed to complete in 15000ms
[requestTimeout 60000 (to reach the 30 s lock THROW)] after 30.1s: RequestError code=EREQUEST number=50001 class=16 state=1 line=9 proc= :: CRM migration: could not get the application lock
```

- With the driver default (`requestTimeout` 15000 ms, which is what the app gets), the error that appears is the **driver ETIMEOUT at ~15 s**, not the THROW: the 30 s `@LockTimeout` is longer than the driver timeout. The client abandons the request (attention); the server rolls the batch back (no transaction left, no waiter in `sys.dm_tran_locks`), schema/`modify_date`/counts unchanged.
- With `requestTimeout` raised to 60 s, the THROW appears at ~30 s: `50001 CRM migration: could not get the application lock`; same clean state.
- After the lock was released, migrate succeeded in both runs; schema equal to (a), data kept.
- Harness note: my first attempt at the 60 s variant failed because my lock-holder connection was closed by the pool's idle timeout after 30 s (releasing the lock), so migrate got it and succeeded; I fixed the holder (long idle timeout) and reran. That run is not in the results.

## FAIL details

### (g) `addInteraccion` maps every 547 to `EmpresaNotFoundError` (extra probe; the requested check passes)

- Requested check, PASS: `addInteraccion` on an unknown empresa → `EmpresaNotFoundError: Empresa not found: empresa-fantasma`.
- Extra probe, FAIL: `addInteraccion(<existing empresa>, {..., resultado: 'xx'})` violates `CK_CrmInteraccion_resultado` (also error 547) and the repository reports `EmpresaNotFoundError: Empresa not found: <the existing empresa id>`.
- Full SQL Server error behind it (547, class 16): `The INSERT statement conflicted with the CHECK constraint "CK_CrmInteraccion_resultado". The conflict occurred in database "crm_r19_c", table "dbo.CrmInteraccion", column 'resultado'.` (same shape as the 547 shown for `medio` in the (g) updateSeguimiento check).
- Statement: `INSERT INTO dbo.CrmInteraccion (idEmpresa, idUsuario, nombreUsuario, direccion, medio, medioOtro, resultado, resumen) OUTPUT INSERTED... VALUES (...)` in `addInteraccion`; the catch is `if (numeroDeError(error) === FK_VIOLATION) throw new EmpresaNotFoundError(idEmpresa)` with `FK_VIOLATION = 547`, which also matches CHECK violations.
- Impact: only reachable if the use case passes an invalid direccion/medio/resultado (it validates them first), so a user would see "not found" instead of a validation error. Not fixed here (no code changes allowed); the mapping could check the constraint name in the message (`FK_CrmInteraccion_empresa`).

## Notes

- (g) ran on the database upgraded in (c); it was not reset in between, so data from the checks accumulates there. (g) also verifies that `updateSeguimiento` is one transaction (a failing interaction INSERT rolls back the UPDATE) and that `fusionar` moves interactions, dedups contacts, keeps the destination's principal and leaves no open transaction.
- Not run: nothing from the requested list was skipped. Not covered: the exact 15.0.2180.2 RTM build (the image is CU18, 15.0.4261.1).
