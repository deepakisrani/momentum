import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider'

function Probe() {
  const { theme, toggle } = useTheme()
  return <button onClick={toggle}>theme:{theme}</button>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to dark (system not light), toggles to light, applies the class, and persists', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    // default
    expect(screen.getByText('theme:dark')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // toggle
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('theme:light')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('momentum.theme')).toBe('light')
  })

  it('respects a persisted preference over the system default', () => {
    localStorage.setItem('momentum.theme', 'light')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByText('theme:light')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
