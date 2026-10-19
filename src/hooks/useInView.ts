import { useEffect, useRef, useState, type CSSProperties } from 'react'

type UseInViewOptions = {
  threshold?: number
  rootMargin?: string
  once?: boolean
}

export function useInView<T extends HTMLElement = HTMLElement>(options: UseInViewOptions = {}) {
  const { threshold = 0.12, rootMargin = '0px 0px -6% 0px', once = true } = options
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setInView(true)
        if (once) observer.disconnect()
      },
      { threshold, rootMargin },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return { ref, inView }
}

export function useRevealClasses<T extends HTMLElement = HTMLElement>(
  variant: 'up' | 'left' | 'right' | 'scale' = 'up',
  delayMs = 0,
) {
  const { ref, inView } = useInView<T>()
  const className = [
    'product-landing__reveal',
    `product-landing__reveal--${variant}`,
    inView ? 'product-landing__reveal--in' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const style = { '--reveal-delay': `${delayMs}ms` } as CSSProperties

  return { ref, inView, className, style }
}
