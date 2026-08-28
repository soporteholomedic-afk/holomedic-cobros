# Valoraciones Email Specification

## Purpose

Integrated email dispatch for valorizaciones: a dedicated send route under permiso `valoraciones`, dynamic plantillas for the new `valoraciones` area, REQ-01 RUC-based recipient prefill, and automatic PDF/Excel attachments.

## Requirements

### Requirement: Dedicated send route with `facturacion` SMTP purpose

`POST /api/valoraciones/send` MUST require permiso `valoraciones` and dispatch via the existing `sendEmail` transport with SMTP purpose `facturacion` (reusing existing creds — no new env pair). v1 MUST NOT write send-audit rows to HOLOMEDIC. Failures MUST return user-safe error codes without credential or internal-detail leakage. (Slice 3)

#### Scenario: Successful send (Gherkin 4)

- GIVEN a composed valorizaciones email with recipients, template, and attachments
- WHEN the operator confirms send
- THEN the API dispatches via the `facturacion` SMTP creds and reports success

#### Scenario: SMTP failure is user-safe

- GIVEN the SMTP transport rejects the session
- WHEN send is attempted
- THEN the API returns a safe error code and message, and no HOLOMEDIC rows are written

### Requirement: `valoraciones` plantillas area and token resolvers

The plantillas editor MUST register a `valoraciones` area config (token palette, predefined tables, mock preview data) so `GET /api/plantillas?area=valoraciones` returns templates, and widened `InterpolationContext` token resolvers MUST resolve valoraciones tokens in subject and body. (Slice 3)

#### Scenario: Template selection and interpolation

- GIVEN templates exist for area `valoraciones`
- WHEN the send modal loads templates and the operator picks one
- THEN subject and body render with valoraciones tokens resolved

### Requirement: REQ-01 RUC recipient prefill

The send modal MUST prefill recipients from the REQ-01 contact directory using the RUC obtained from the client lookup (`Cliente.NroRuc` by `CodCli`). When no valid RUC exists (e.g. DNI-keyed particulares), the modal MUST degrade gracefully to manual entry. (Slice 3)

#### Scenario: Corporate client prefill

- GIVEN the selected client has a populated `NroRuc`
- WHEN the operator opens "Enviar Documentos"
- THEN recipient `to`/`cc` are prefilled from the REQ-01 contact lookup

#### Scenario: No RUC degrades to manual entry

- GIVEN the client has no valid RUC
- WHEN the modal opens
- THEN recipients are empty and manually editable without a lookup error

### Requirement: Automatic PDF and Excel attachments

The send flow MUST automatically attach the generated PDF and/or Excel for the valorized company without requiring file uploads by the operator. (Slice 3)

#### Scenario: Attachments included

- WHEN the operator sends with both exports selected
- THEN the SMTP message carries the PDF and `.xlsx` as attachments
