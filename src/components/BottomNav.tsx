import { NavLink } from 'react-router-dom'
import { BookmarkIcon, FilmIcon, GearIcon, SearchIcon } from './Icons'

const items = [
  { to: '/', label: 'Now', icon: FilmIcon, end: true },
  { to: '/search', label: 'Search', icon: SearchIcon, end: false },
  { to: '/my-movies', label: 'My Movies', icon: BookmarkIcon, end: false },
  { to: '/settings', label: 'Settings', icon: GearIcon, end: false },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
