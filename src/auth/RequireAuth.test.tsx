import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from './AuthProvider'
import { RequireAuth } from './RequireAuth'

function renderAt(session: any, loading = false) {
  return render(
    <AuthContext.Provider value={{ session, loading }}>
      <MemoryRouter initialEntries={['/secret']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/secret" element={<RequireAuth><div>secret content</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('RequireAuth', () => {
  it('redirects to /login when there is no session', () => {
    renderAt(null)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })
  it('renders children when a session exists', () => {
    renderAt({ user: { id: 'u1' } })
    expect(screen.getByText('secret content')).toBeInTheDocument()
  })
  it('renders nothing while loading', () => {
    const { container } = renderAt(null, true)
    expect(container).toBeEmptyDOMElement()
  })
})
