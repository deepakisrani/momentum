import { isAndroid, momentumAndroid } from './momentumAndroid'

/** Trigger a browser download of `text` as a file. */
export async function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): Promise<void> {
  if (isAndroid) {
    await momentumAndroid.saveCsv({ filename, text, mime })
    return
  }
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
