import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import type { FileViewer, PreviewArgs } from '../FileViewer';

/**
 * Type-level compile tests for the `FileViewer` Strategy interface.
 *
 * These tests verify the SHAPE of the interface — TypeScript would
 * reject this file at compile time if any of:
 *   - `supportedExtensions` is missing or has a different type
 *   - `canPreview` is missing or has a different signature
 *   - `buildPreviewUrl` is missing or has a different signature
 *   - `renderPreview` is missing or has a different return type
 *   - `PreviewArgs` is missing required fields
 *
 * The runtime assertions are sanity checks that the mock above is well-formed.
 */
describe('FileViewer Strategy interface', () => {
  // A minimal implementation that TypeScript will reject if the interface drifts.
  const mockViewer: FileViewer = {
    supportedExtensions: ['ext'],
    canPreview(name) {
      return name.endsWith('.ext');
    },
    buildPreviewUrl(args) {
      return args.ruc + args.dni + args.idAten + args.folderPath + args.name;
    },
    renderPreview(args): ReactElement {
      // The interface contract is "returns a ReactElement" — we touch
      // `args` here so the linter sees the parameter as used.
      void args;
      return null as unknown as ReactElement;
    },
  };

  it('declares supportedExtensions as a readonly string array', () => {
    expect(Array.isArray(mockViewer.supportedExtensions)).toBe(true);
    expect(mockViewer.supportedExtensions).toEqual(['ext']);
  });

  it('declares canPreview(name) returning a boolean', () => {
    expect(typeof mockViewer.canPreview('foo.ext')).toBe('boolean');
    expect(mockViewer.canPreview('foo.ext')).toBe(true);
  });

  it('declares buildPreviewUrl(args) returning a string', () => {
    const args: PreviewArgs = {
      ruc: 'R',
      dni: '1',
      idAten: 'A',
      folderPath: '',
      name: 'n',
    };
    expect(typeof mockViewer.buildPreviewUrl(args)).toBe('string');
  });

  it('declares renderPreview(args) returning a ReactElement', () => {
    const args: PreviewArgs = {
      ruc: 'R',
      dni: '1',
      idAten: 'A',
      folderPath: '',
      name: 'n',
    };
    // The return is ReactElement; we just check the function exists and runs.
    const result = mockViewer.renderPreview(args);
    expect(result).toBeDefined();
  });

  it('PreviewArgs carries ruc, dni, idAten, folderPath, name, and optional textContent', () => {
    const minimal: PreviewArgs = {
      ruc: 'R',
      dni: '1',
      idAten: 'A',
      folderPath: '',
      name: 'n',
    };
    expect(minimal.textContent).toBeUndefined();
    const withText: PreviewArgs = { ...minimal, textContent: 'hello' };
    expect(withText.textContent).toBe('hello');
  });
});
