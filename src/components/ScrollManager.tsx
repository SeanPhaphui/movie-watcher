import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * `<BrowserRouter>` has no scroll handling at all, which showed up two ways:
 * opening a movie from halfway down the list left the detail page already
 * scrolled, and coming back landed at the old offset in a list that had been
 * rebuilt shorter.
 *
 * Forward navigations start at the top; back and forward restore where you
 * were. (React Router's own <ScrollRestoration> is data-router only.)
 */
export function ScrollManager() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const positions = useRef(new Map<string, number>())

  // Record continuously — reading scrollY during cleanup is too late, the
  // browser has often already moved it.
  useEffect(() => {
    const key = location.key
    const onScroll = () => positions.current.set(key, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key])

  useLayoutEffect(() => {
    if (navigationType === 'POP') {
      const y = positions.current.get(location.key)
      // Restore after paint so the (cached) list has its full height back;
      // scrolling first would be clamped to a page that is still short.
      requestAnimationFrame(() => window.scrollTo(0, y ?? 0))
    } else {
      window.scrollTo(0, 0)
    }
  }, [location.key, navigationType])

  return null
}
