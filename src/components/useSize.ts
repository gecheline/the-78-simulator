import { useLayoutEffect, useRef, useState } from 'react'

/** Tracks an element's rendered size so SVGs can lay out in real pixels. */
export function useSize<T extends HTMLElement>(initial = { w: 1000, h: 640 }) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}
