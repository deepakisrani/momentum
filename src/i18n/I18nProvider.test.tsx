import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { I18nProvider, useT } from './I18nProvider'

function Probe() {
  const t = useT()
  return <span>{t('app.name')} / {t('missing.key')}</span>
}

describe('I18nProvider', () => {
  it('resolves keys and falls back to the key itself', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(screen.getByText('Momentum / missing.key')).toBeInTheDocument()
  })
})
