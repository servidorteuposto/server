/** Horário comercial em Brasília: 08:00 inclusive até 18:00 exclusive. */
export const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
export const BUSINESS_HOUR_START = 8
export const BUSINESS_HOUR_END = 18

export function saoPauloHour(now = new Date()) {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value

  const hour = Number(hourPart)
  return Number.isFinite(hour) ? hour : null
}

export function isSaoPauloBusinessHours(now = new Date()) {
  const hour = saoPauloHour(now)
  if (hour === null) return false
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END
}
