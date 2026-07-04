export function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function cnpjDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function isValidCnpjLength(value: string) {
  return cnpjDigits(value).length === 14
}

const INVALID_CNPJ_SEQUENCES = new Set(
  Array.from({ length: 10 }, (_, digit) => String(digit).repeat(14)),
)

function calculateCnpjVerifierDigit(digits: number[], weights: number[]) {
  const sum = digits.reduce((total, digit, index) => total + digit * weights[index], 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

export function isValidCnpj(value: string) {
  const digits = cnpjDigits(value)

  if (digits.length !== 14) {
    return false
  }

  if (INVALID_CNPJ_SEQUENCES.has(digits)) {
    return false
  }

  const numbers = digits.split('').map(Number)
  const firstVerifier = calculateCnpjVerifierDigit(numbers.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const secondVerifier = calculateCnpjVerifierDigit(
    numbers.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )

  return numbers[12] === firstVerifier && numbers[13] === secondVerifier
}

export const CNPJ_INVALID_MESSAGE = 'Informe um CNPJ válido.'

export function looksLikeEmail(value: string) {
  return value.includes('@')
}
