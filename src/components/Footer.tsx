export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-8 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">
          &copy; {year} IntelliPF. Self-hosted and yours.
        </p>
        <p className="m-0 text-sm">
          Powered by TanStack Start, SQLite, Plaid, and your favorite LLM.
        </p>
      </div>
    </footer>
  )
}
