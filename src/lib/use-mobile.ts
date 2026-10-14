import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

// True on screens too narrow for the side-by-side layout.
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return mobile
}
