export const PASSWORD_RULE_MESSAGE =
  'A senha deve ter no mínimo 8 caracteres, incluindo letras, números e um caractere especial.'

export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false
  if (!/[a-zA-Z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  if (!/[^a-zA-Z0-9]/.test(password)) return false
  return true
}
