import { useEffect } from 'react'

function App() {
  useEffect(() => {
    fetch('/api/spider')
      .then(res => res.json())
      .then(data => console.log('API response:', data))
      .catch(err => console.error('API error:', err))
  }, [])

  return (
    <div>
      <h1>Hummingbird</h1>
      <p>Phase 1 skeleton — check console for API response</p>
    </div>
  )
}

export default App
