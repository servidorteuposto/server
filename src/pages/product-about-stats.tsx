import { useEffect, useState, type CSSProperties } from 'react'
import { useInView } from '../hooks/useInView'

type StatConfig =
  | { type: 'count'; value: number; suffix?: string; label: string }
  | { type: 'text'; text: string; label: string }

const STATS: StatConfig[] = [
  { type: 'count', value: 27, suffix: '+', label: 'anos de experiência no setor' },
  { type: 'count', value: 2300, suffix: '+', label: 'postos atendidos na trajetória' },
  { type: 'text', text: 'BR e UY', label: 'atuação nacional e internacional' },
]

function useCountUp(target: number, active: boolean, durationMs = 1400) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!active) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCurrent(target)
      return
    }

    let startTime: number | null = null
    let frame = 0

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(target * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [active, durationMs, target])

  return current
}

function formatCount(value: number) {
  return value.toLocaleString('pt-BR')
}

function LandingStatCard({ stat, index }: { stat: StatConfig; index: number }) {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.35 })
  const count = useCountUp(stat.type === 'count' ? stat.value : 0, inView && stat.type === 'count')

  const display =
    stat.type === 'count' ? `${formatCount(count)}${stat.suffix ?? ''}` : stat.text

  return (
    <article
      ref={ref}
      className={[
        'product-landing__stat',
        'product-landing__reveal',
        'product-landing__reveal--scale',
        inView ? 'product-landing__reveal--in' : '',
      ].join(' ')}
      style={{ '--reveal-delay': `${index * 120}ms` } as CSSProperties}
    >
      <strong className={stat.type === 'count' && inView ? 'product-landing__stat-value--counting' : ''}>
        {display}
      </strong>
      <span>{stat.label}</span>
    </article>
  )
}

export function ProductAboutStats() {
  return (
    <section className="product-landing__stats" aria-label="Números de destaque">
      <div className="product-landing__container product-landing__stats-grid">
        {STATS.map((stat, index) => (
          <LandingStatCard key={stat.label} stat={stat} index={index} />
        ))}
      </div>
    </section>
  )
}
