import { useT } from '../i18n/I18nProvider'

/** Theme-aware wordmark: black-text logo on light, white-text logo on dark. */
export function Wordmark({ className = '' }: { className?: string }) {
  const t = useT()
  return (
    <>
      <img src="/momentum-wordmark-light.png" alt={t('app.name')} className={`${className} block dark:hidden`} />
      <img src="/momentum-wordmark-dark.png" alt="" aria-hidden="true" className={`${className} hidden dark:block`} />
    </>
  )
}
