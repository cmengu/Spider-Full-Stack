import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Visualisation from './pages/Visualisation.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/visualisation" element={<Visualisation />} />
    </Routes>
  )
}

export default App
