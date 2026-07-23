export const DIESEL_DRAINAGES_STORAGE_BUCKET = 'diesel-drainages'

export const RESIDUES_CONFIRMATION_LABEL =
  'Confirmo a eliminação de resíduos e a pureza do produto na saída do dreno.'

/** Periodicidade obrigatória da drenagem (dias). */
export const DIESEL_DRAINAGE_INTERVAL_DAYS = 7

export const DRAINAGE_TIME_ZONE = 'America/Sao_Paulo'

export type DieselTankTypeKey =
  | 'diesel-s10-comum'
  | 'diesel-s10-aditivado'
  | 'diesel-s500-comum'
  | 'diesel-s500-aditivado'

export type DieselTankType = {
  key: DieselTankTypeKey
  label: string
}

export const DIESEL_TANK_TYPES: DieselTankType[] = [
  { key: 'diesel-s10-comum', label: 'S10 Comum' },
  { key: 'diesel-s10-aditivado', label: 'S10 Aditivado' },
  { key: 'diesel-s500-comum', label: 'S500 Comum' },
  { key: 'diesel-s500-aditivado', label: 'S500 Aditivado' },
]

export const DIESEL_TANK_TYPE_LABELS: Record<DieselTankTypeKey, string> = Object.fromEntries(
  DIESEL_TANK_TYPES.map((type) => [type.key, type.label]),
) as Record<DieselTankTypeKey, string>

export function isDieselTankTypeLabel(name: string) {
  const normalized = name.trim().toLowerCase()
  return DIESEL_TANK_TYPES.some((type) => type.label.toLowerCase() === normalized)
}

export type DrainageReminderKind = 'day_before' | 'due_day'

export type DrainageDueStatus = 'ok' | 'day_before' | 'due_today' | 'overdue' | 'never'

export type DrainageSchedule = {
  tankId: string
  tankName: string
  lastDrainedAt: string | null
  dueDate: string | null
  warnDate: string | null
  status: DrainageDueStatus
  message: string
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

/** Data civil YYYY-MM-DD no fuso de São Paulo. */
export function toSaoPauloDateKey(value: string | Date = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DRAINAGE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return { year, month, day }
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`
}

export function formatDateKeyPtBr(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

export function getDrainageDueStatus(
  lastDrainedAt: string | null | undefined,
  now: Date = new Date(),
): Omit<DrainageSchedule, 'tankId' | 'tankName'> {
  if (!lastDrainedAt) {
    return {
      lastDrainedAt: null,
      dueDate: null,
      warnDate: null,
      status: 'never',
      message: 'Ainda não há drenagem registrada. Lance a primeira para iniciar o ciclo semanal.',
    }
  }

  const lastKey = toSaoPauloDateKey(lastDrainedAt)
  const todayKey = toSaoPauloDateKey(now)
  if (!lastKey || !todayKey) {
    return {
      lastDrainedAt,
      dueDate: null,
      warnDate: null,
      status: 'ok',
      message: 'Não foi possível calcular o prazo da próxima drenagem.',
    }
  }

  const dueDate = addDaysToDateKey(lastKey, DIESEL_DRAINAGE_INTERVAL_DAYS)
  const warnDate = addDaysToDateKey(dueDate, -1)

  if (todayKey < warnDate) {
    return {
      lastDrainedAt,
      dueDate,
      warnDate,
      status: 'ok',
      message: `Próxima drenagem até ${formatDateKeyPtBr(dueDate)}.`,
    }
  }

  if (todayKey === warnDate) {
    return {
      lastDrainedAt,
      dueDate,
      warnDate,
      status: 'day_before',
      message: `Aviso: amanhã (${formatDateKeyPtBr(dueDate)}) completa 1 semana da última drenagem.`,
    }
  }

  if (todayKey === dueDate) {
    return {
      lastDrainedAt,
      dueDate,
      warnDate,
      status: 'due_today',
      message: `Hoje completa 1 semana da última drenagem. É necessário lançar o relatório.`,
    }
  }

  return {
    lastDrainedAt,
    dueDate,
    warnDate,
    status: 'overdue',
    message: `Drenagem atrasada desde ${formatDateKeyPtBr(dueDate)}. Lance um novo relatório.`,
  }
}

export function buildTankDrainageSchedules(
  tanks: Array<{ id: string; name: string; is_active: boolean }>,
  reports: Array<{ tank_id: string; drained_at: string }>,
  now: Date = new Date(),
): DrainageSchedule[] {
  return tanks
    .filter((tank) => tank.is_active)
    .map((tank) => {
      const last = reports
        .filter((report) => report.tank_id === tank.id)
        .sort((a, b) => b.drained_at.localeCompare(a.drained_at))[0]

      const schedule = getDrainageDueStatus(last?.drained_at ?? null, now)
      return {
        tankId: tank.id,
        tankName: tank.name,
        ...schedule,
      }
    })
}

export function reminderKindForStatus(
  status: DrainageDueStatus,
): DrainageReminderKind | null {
  if (status === 'day_before') return 'day_before'
  if (status === 'due_today') return 'due_day'
  return null
}
