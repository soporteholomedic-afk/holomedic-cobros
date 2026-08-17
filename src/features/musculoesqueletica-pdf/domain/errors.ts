/**
 * Typed failures of the PDF pipeline. The route maps each class to an HTTP
 * status: 404 (not found), 502 (data source / browser unavailable), 500
 * (render / merge / template failure). Error messages never carry clinical
 * payloads.
 */
export class PdfServiceError extends Error {}

/** The atencion does not exist (route → 404). */
export class AtencionNotFoundError extends PdfServiceError {}

/** A required dataset (entrevista / evaluacion) is missing (route → 404). */
export class DatasetNotFoundError extends PdfServiceError {}

/** A data loader failed (database unavailable) (route → 502). */
export class DataSourceUnavailableError extends PdfServiceError {}

/** No usable Edge executable could be resolved (route → 502). */
export class EdgeUnavailableError extends PdfServiceError {}

/** The browser launched but could not produce the page PDF (route → 502). */
export class PrintError extends PdfServiceError {}

/** Template read, asset inlining, or token rendering failed (route → 500). */
export class TemplateError extends PdfServiceError {}

/** Merging the page PDFs failed (route → 500). */
export class MergeError extends PdfServiceError {}