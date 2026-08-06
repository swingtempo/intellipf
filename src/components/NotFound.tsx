import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--muted-fg)]" />
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="mb-6 text-[var(--muted-fg)]">The page you&rsquo;re looking for doesn&apos;t exist.</p>
        <Link to="/" className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]">
          Go home
        </Link>
      </div>
    </div>
  )
}
