import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NoteEditorSheet } from './NoteEditorSheet'
import type { ExerciseRow, NoteRow } from '../../data/rows'
import type { NoteWithTags } from '../../data/noteRepo'

// The sheet's only outside calls. The rest of noteRepo is listed because NoteWithTags pulls
// the module in; leaving an export off the factory would break the import, not the sheet.
vi.mock('../../data/noteRepo', () => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  listNotes: vi.fn(),
  deleteNote: vi.fn(),
}))
// exerciseRepo is mocked for the sheet's own getExercisesByIds *and* for the real
// ExercisePickerSheet rendered inside it — the picker is deliberately NOT stubbed, because
// the thing under test is that clicks originating in it never reach the sheet's backdrop.
vi.mock('../../data/exerciseRepo', () => ({
  getExercisesByIds: vi.fn(),
  listExercises: vi.fn(),
  addCustomExercise: vi.fn(),
}))

const { createNote, updateNote } = await import('../../data/noteRepo')
const { getExercisesByIds, listExercises } = await import('../../data/exerciseRepo')
const createNoteMock = vi.mocked(createNote)
const updateNoteMock = vi.mocked(updateNote)
const getExercisesByIdsMock = vi.mocked(getExercisesByIds)
const listExercisesMock = vi.mocked(listExercises)

function ex(id: string, name: string): ExerciseRow {
  return { id, owner_user_id: null, name, muscle_group: 'Chest', equipment: null, mechanic: null, is_public: true }
}
const SQUAT = ex('e1', 'Squat')
const BENCH = ex('e2', 'Bench Press')

function note(over: Partial<NoteRow> & { exerciseIds?: string[] } = {}): NoteWithTags {
  return {
    id: 'n1', user_id: 'u1', body: 'elbow twinged on set 3', session_id: null,
    created_at: '2026-08-17T09:00:00Z', updated_at: '2026-08-17T09:00:00Z',
    exerciseIds: [], ...over,
  }
}

const saveBtn = () => screen.getByRole('button', { name: 'Save' })

beforeEach(() => {
  vi.clearAllMocks()
  createNoteMock.mockResolvedValue('new-id')
  updateNoteMock.mockResolvedValue(undefined)
  getExercisesByIdsMock.mockResolvedValue({ e1: SQUAT })
  listExercisesMock.mockResolvedValue([SQUAT, BENCH])
  document.body.style.overflow = ''
})
afterEach(() => { vi.restoreAllMocks() })

describe('NoteEditorSheet — saving', () => {
  it('keeps Save disabled until the body has more than whitespace', async () => {
    const user = userEvent.setup()
    render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={() => {}} />)
    expect(saveBtn()).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Notes' }), '   ')
    expect(saveBtn()).toBeDisabled() // the DB's length(trim(body)) > 0 is the backstop, not the UX

    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'ok')
    expect(saveBtn()).toBeEnabled()
  })

  it('creates with the live session id and the pre-tagged exercise', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(
      <NoteEditorSheet userId="u1" sessionId="s1" initialExerciseIds={['e1']} onSaved={onSaved} onClose={() => {}} />
    )
    await screen.findByText('Squat') // the one batched name lookup resolved
    expect(getExercisesByIdsMock).toHaveBeenCalledExactlyOnceWith(['e1'])

    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'felt heavy')
    await user.click(saveBtn())

    expect(createNoteMock).toHaveBeenCalledWith('u1', { body: 'felt heavy', sessionId: 's1', exerciseIds: ['e1'] })
    expect(updateNoteMock).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('creates a standalone note with no session and no tags', async () => {
    const user = userEvent.setup()
    render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={() => {}} />)
    expect(screen.getByText('No exercises tagged')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'slept badly')
    await user.click(saveBtn())
    expect(createNoteMock).toHaveBeenCalledWith('u1', { body: 'slept badly', sessionId: null, exerciseIds: [] })
  })

  it('updates by note id when handed a note, and never creates a second one', async () => {
    const user = userEvent.setup()
    render(
      <NoteEditorSheet userId="u1" note={note({ id: 'n7', exerciseIds: ['e1'] })} onSaved={() => {}} onClose={() => {}} />
    )
    const box = screen.getByRole('textbox', { name: 'Notes' })
    expect(box).toHaveValue('elbow twinged on set 3') // opens on the existing body
    await user.type(box, ' — try a wider grip')
    await user.click(saveBtn())

    expect(updateNoteMock).toHaveBeenCalledWith('n7', {
      body: 'elbow twinged on set 3 — try a wider grip',
      exerciseIds: ['e1'],
    })
    expect(createNoteMock).not.toHaveBeenCalled()
  })

  it('drops a removed tag from the payload without closing the sheet', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <NoteEditorSheet userId="u1" note={note({ exerciseIds: ['e1'] })} onSaved={() => {}} onClose={onClose} />
    )
    await user.click(await screen.findByRole('button', { name: 'Remove Tag: Squat' }))
    expect(screen.queryByText('Squat')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled() // the ✕ sits inside the click-to-close backdrop

    await user.click(saveBtn())
    expect(updateNoteMock).toHaveBeenCalledWith('n1', { body: 'elbow twinged on set 3', exerciseIds: [] })
  })

  it('surfaces the error and stays open with the typed body when the write fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    createNoteMock.mockRejectedValue(new Error('offline'))
    render(<NoteEditorSheet userId="u1" onSaved={onSaved} onClose={onClose} />)
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'do not lose me')
    await user.click(saveBtn())

    expect(screen.getByText('Something went wrong — please try again.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Retry is one tap away, with the text still there.
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('do not lose me')
    expect(saveBtn()).toBeEnabled()
    expect(logged).toHaveBeenCalledWith('[Notes] save failed:', expect.any(Error))
  })
})

describe('NoteEditorSheet — the picker must not dismiss the sheet', () => {
  it('adds a tag without closing the sheet or losing the body', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={onClose} />)
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'wider grip next time')

    await user.click(screen.getByRole('button', { name: '+ Tag Exercise' }))
    await user.click(await screen.findByRole('button', { name: /Bench Press/ }))

    // The picker used to live inside the click-to-close backdrop, so this very click closed
    // the editor and threw the body away.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('wider grip next time')
    expect(screen.getByRole('button', { name: 'Remove Tag: Bench Press' })).toBeInTheDocument()

    await user.click(saveBtn())
    expect(createNoteMock).toHaveBeenCalledWith('u1', {
      body: 'wider grip next time', sessionId: null, exerciseIds: ['e2'],
    })
  })

  it('closes only the picker when the picker\'s own backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: '+ Tag Exercise' }))
    await screen.findByRole('button', { name: /Bench Press/ })

    // Last fixed overlay in the DOM = the picker's backdrop (it is a sibling of the sheet's).
    const overlays = container.querySelectorAll('.fixed.inset-0')
    expect(overlays).toHaveLength(2)
    await user.click(overlays[1])

    expect(screen.queryByRole('button', { name: /Bench Press/ })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument()
  })

  it('leaves page scroll locked while the sheet is open and restores it on close', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')

    // The picker's own lock nests inside the sheet's. Unwound in this order it is correct;
    // it is only wrong if the sheet is torn down with the picker still open, which the
    // picker's full-screen overlay prevents.
    await user.click(screen.getByRole('button', { name: '+ Tag Exercise' }))
    await screen.findByRole('button', { name: /Bench Press/ })
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: /Bench Press/ }))
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('NoteEditorSheet — backdrop dismissal', () => {
  it('closes on a backdrop click but not on a click inside the card', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={onClose} />)
    // The sheet heading is prose ('New note'), not the button label ('New Note') -- the two
    // roles use separate keys precisely so the title-case convention can hold for both.
    await user.click(screen.getByRole('heading', { name: 'New note' }))
    expect(onClose).not.toHaveBeenCalled()

    const backdrop = container.querySelector('.fixed.inset-0')
    if (backdrop) await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when a text selection started in the textarea ends on the backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(<NoteEditorSheet userId="u1" onSaved={() => {}} onClose={() => onClose()} />)
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement

    // Dragging out of the textarea dispatches the click at the two nodes' common ancestor —
    // which is the backdrop itself, so a target check alone would discard the note.
    fireEvent.mouseDown(screen.getByRole('textbox', { name: 'Notes' }))
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })
})
