import { createContext, useContext, type ReactNode } from 'react'
import en from './strings/en.json'

type Dict = Record<string, string>
const I18nContext = createContext<Dict>(en as Dict)

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={en as Dict}>{children}</I18nContext.Provider>
}

export function useT() {
  const dict = useContext(I18nContext)
  return (key: string): string => dict[key] ?? key
}
