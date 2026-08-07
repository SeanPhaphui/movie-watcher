import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { BottomNav } from './components/BottomNav'
import { IntroSheet } from './components/IntroSheet'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { MovieDetail } from './pages/MovieDetail'
import { Watchlist } from './pages/Watchlist'
import { Settings } from './pages/Settings'

function Header() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/movie/')) return null
  return (
    <header className="app-header">
      <div className="wordmark">
        Marquee<em>.</em>
      </div>
      <div className="header-sub">theater → stream</div>
    </header>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/movie/:id" element={<MovieDetail />} />
            <Route path="/my-movies" element={<Watchlist />} />
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
