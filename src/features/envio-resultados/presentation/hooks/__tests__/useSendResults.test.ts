import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Import under test ----
import { useSendResults } from '../useSendResults';

const defaultArgs = {
  to: ['test@example.com'],
  subject: 'Test Subject',
  html: '<p>Test</p>',
  files: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSendResults', () => {
  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useSendResults(defaultArgs));

    expect(result.current.isSending).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set isSending to true when send is called', async () => {
    // Mock fetch to return a pending promise so we can check the loading state
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useSendResults(defaultArgs));

    act(() => {
      result.current.send();
    });

    expect(result.current.isSending).toBe(true);

    mockFetch.mockRestore();
  });

  it('should set result on successful send', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, messageId: 'msg-001' }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.result).toEqual({ success: true, messageId: 'msg-001' });
    expect(result.current.error).toBeNull();
  });

  it('should set error when API returns failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'SMTP error' }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBe('SMTP error');
  });

  it('should set error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Network error');
  });
});
