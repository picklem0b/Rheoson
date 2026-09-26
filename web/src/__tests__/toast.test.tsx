import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnimatePresence } from 'framer-motion'
import { Toast } from '@/components/ui/Toast'
import type { ToastData } from '@/components/ui/Toast'

function renderToast(props: Partial<ToastData> & { type: ToastData['type'] }) {
  const data: ToastData = { id: 't1', message: 'msg', ...props }
  return render(
    <AnimatePresence>
      <Toast {...data} onDismiss={() => {}} />
    </AnimatePresence>
  )
}

// ── Pass/fail variants ───────────────────────────────────────

describe('Toast variants', () => {
  it('success renders with the success role and green accent', () => {
    renderToast({ type: 'success', message: 'Download complete — “Song”' })
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(/download complete/i)).toBeTruthy()
    expect(document.querySelector('[class*="success"]')).toBeTruthy()
  })

  it('error renders with the alert role and red accent', () => {
    renderToast({ type: 'error', message: 'Download failed' })
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/download failed/i)).toBeTruthy()
    expect(document.querySelector('[class*="danger"]')).toBeTruthy()
  })

  it('info and warning render as status', () => {
    const { unmount } = renderToast({ type: 'info', message: 'hi' })
    expect(screen.getByRole('status')).toBeTruthy()
    unmount()
    renderToast({ type: 'warning', message: 'hm' })
    expect(screen.getByRole('status')).toBeTruthy()
  })
})

// ── The ⓘ full-message control ───────────────────────────────

describe('Toast info control', () => {
  it('shows ⓘ when a fullDetail exists and expands to it on click', () => {
    renderToast({
      type: 'error',
      message: 'Download failed',
      fullDetail:
        'Download failed — the media server cut the transfer short. Retry to resume from where it stopped. [ERR DEX01]',
      code: 'DEX01',
    })
    const info = screen.getByRole('button', { name: /show error details/i })
    fireEvent.click(info)
    expect(
      screen.getByText(/the media server cut the transfer short/i)
    ).toBeTruthy()
    // The code renders as a chip: "[ERR DEX01]"
    expect(screen.getByText(/\[ERR DEX01\]/)).toBeTruthy()
  })

  it('code is exposed to screen readers even when collapsed', () => {
    renderToast({ type: 'error', message: 'Download failed', code: 'DEX01' })
    expect(screen.getByText(/error code dex01/i)).toBeTruthy()
  })

  it('plain toast without detail has no ⓘ', () => {
    renderToast({ type: 'info', message: 'All caught up' })
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull()
  })

  it('dismiss button is present and labelled', () => {
    renderToast({ type: 'info', message: 'hi' })
    expect(screen.getByRole('button', { name: /dismiss notification/i })).toBeTruthy()
  })
})
