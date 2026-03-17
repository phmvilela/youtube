import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Search from './pages/Search'
import Watch from './pages/Watch'
import KeyDebug from './pages/KeyDebug'
import Admin from './pages/Admin'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Search />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/debug" element={<KeyDebug />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
