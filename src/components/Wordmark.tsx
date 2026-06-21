import { useT } from '../i18n/I18nProvider'

/** Theme-aware wordmark: black-text logo on light, white-text logo on dark. */
export function Wordmark({ className = '' }: { className?: string }) {
  const t = useT()
  // Public assets must be prefixed with the Vite base so they resolve under
  // the /momentum/ GitHub Pages subpath (Vite does not rebase runtime string srcs).
  const base = import.meta.env.BASE_URL
  return (
    <>
      <img src={`${base}momentum-wordmark-light.png`} alt={t('app.name')} className={`${className} block dark:hidden`} />
      <img src={`${base}momentum-wordmark-dark.png`} alt="" aria-hidden="true" className={`${className} hidden dark:block`} />
    </>
  )
}
