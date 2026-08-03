import { Link } from '@tanstack/react-router'
import { Settings2, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { key: 'dashboard', to: '/', exact: true },
  { key: 'accounts', to: '/accounts' },
  { key: 'transactions', to: '/transactions' },
  { key: 'netWorth', to: '/net-worth' },
  { key: 'budgets', to: '/budgets' },
  { key: 'portfolio', to: '/portfolio' },
  { key: 'retirement', to: '/retirement' },
  { key: 'goals', to: '/goals' },
  { key: 'chat', to: '/chat' },
] as const

export default function Header() {
  const { t } = useTranslation()

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#56c6be,#7ed3bf)]">
              <Wallet className="h-3 w-3 text-white" />
            </span>
            <span>{t('app.name')}</span>
          </Link>
        </h2>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className="nav-link"
              activeOptions={{ exact: ('exact' in item ? item.exact : undefined) ?? false }}
              activeProps={{ className: 'nav-link is-active' }}
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/settings"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
            title={t('nav.settings')}
          >
            <span className="flex items-center gap-1">
              <Settings2 className="h-4 w-4" />
              <span className="sm:hidden">{t('nav.settings')}</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
