/**
 * Template store: exports all page manifests and the canonical render order.
 *
 * This is the single source of truth for page ordering and manifest lookup.
 * Pages 1-4 consume entrevista data; pages 5-9 consume evaluacion data.
 */

import type { PdfPageManifest } from '../../domain/entities';
import { PAGE_1_MANIFEST } from './page1';
import { PAGE_2_MANIFEST } from './page2';
import { PAGE_3_MANIFEST } from './page3';
import { PAGE_4_MANIFEST } from './page4';
import { PAGE_5_MANIFEST } from './page5';
import { PAGE_6_MANIFEST } from './page6';
import { PAGE_7_MANIFEST } from './page7';
import { PAGE_8_MANIFEST } from './page8';
import { PAGE_9_MANIFEST } from './page9';

/** All page manifests in deterministic document order (1-9). */
export const ALL_PAGE_MANIFESTS: readonly PdfPageManifest[] = [
  PAGE_1_MANIFEST,
  PAGE_2_MANIFEST,
  PAGE_3_MANIFEST,
  PAGE_4_MANIFEST,
  PAGE_5_MANIFEST,
  PAGE_6_MANIFEST,
  PAGE_7_MANIFEST,
  PAGE_8_MANIFEST,
  PAGE_9_MANIFEST,
];

/** Number of pages in the complete document. */
export const TOTAL_PAGES = ALL_PAGE_MANIFESTS.length;

/** Template path constants for all pages. */
export const PAGE_TEMPLATE_PATHS = ALL_PAGE_MANIFESTS.map((m) => m.template);
