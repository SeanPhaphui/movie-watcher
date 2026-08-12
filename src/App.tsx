import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { BottomNav } from './components/BottomNav'
import { IntroSheet } from './components/IntroSheet'
import { ScrollManager } from './components/ScrollManager'
import { ConnectionBanner } from './components/ConnectionBanner'
import { BellIcon } from './components/Icons'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { MovieDetail } from './pages/MovieDetail'
import { Watchlist } from './pages/Watchlist'
import { Updates } from './pages/Updates'
import { Settings } from './pages/Settings'

function Header() {
  const { pathname } = useLocation()
  const { unreadCount } = useApp()
  if (pathname.startsWith('/movie/')) return null

  return (
    <header className="app-header">
      <Link to="/" className="wordmark">
        Marquee<em>.</em>
      </Link>
      <Link to="/updates" className="header-bell" aria-label={`Updates${unreadCount ? `, ${unreadCount} unread` : ''}`}>
        <BellIcon size={20} />
        {unreadCount > 0 && <span className="bell-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </Link>
    </header>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollManager />
        <Header />
        <ConnectionBanner />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/movie/:id" element={<MovieDetail />} />
            <Route path="/my-movies" element={<Watchlist />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <BottomNav />
        <IntroSheet />
      </BrowserRouter>
    </AppProvider>
  )
}
