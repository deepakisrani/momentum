import { useT } from '../i18n/I18nProvider'

/** Theme-aware wordmark: the `v` nested in the o is a quiet m·v reference. */
export function Wordmark({ className = '' }: { className?: string }) {
  const t = useT()
  // Public assets must be prefixed with the Vite base so they resolve under
  // the /momentum/ GitHub Pages subpath (Vite does not rebase runtime string srcs).
  const base = import.meta.env.BASE_URL
  return (
    <>
      <img src={`${base}momentum-wordmark-light.svg`} alt={t('app.name')} className={`${className} block dark:hidden`} />
      <img src={`${base}momentum-wordmark-dark.svg`} alt="" aria-hidden="true" className={`${className} hidden dark:block`} />
    </>
  )
}
