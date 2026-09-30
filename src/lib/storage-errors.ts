export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return ''
}

export function describeOperationalSaveError(error: unknown, tableName: string) {
  const message = errorMessage(error)
  const lower = message.toLowerCase()

  if (
    message.includes('Bucket inválido') ||
    lower.includes('r2_storage') ||
    lower.includes('presign') ||
    lower.includes('edge function returned') ||
    lower.includes('non-2xx')
  ) {
    return 'O upload ainda está na função antiga. No computador, rode: npm run supabase:deploy-r2-storage'
  }
  if (lower.includes('não autorizado') || lower.includes('invalid jwt') || lower.includes('401')) {
    return 'Sessão sem permissão para salvar. Saia e entre de novo no posto.'
  }
  if (
    lower.includes(tableName) ||
    lower.includes('schema cache') ||
    lower.includes('does not exist') ||
    lower.includes('could not find the table')
  ) {
    return 'Tabela ainda não criada no banco. Rode o SQL correspondente no Teu Posto.'
  }
  return message || 'Não foi possível salvar. Tente novamente.'
}
