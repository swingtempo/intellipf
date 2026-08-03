export function getEnv(key: string): string | undefined {
  return (import.meta.env?.[key] as string | undefined) ?? process.env[key]
}

export function getEnvOr(key: string, fallback: string): string {
  return getEnv(key) ?? fallback
}
