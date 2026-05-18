import { Link, NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-brand-heading shadow-sm">
      <Link to="/" className="text-lg font-bold tracking-tight text-white">
        Hummingbird
      </Link>
      <NavLink
        to="/visualisation"
        className={({ isActive }) =>
          isActive
            ? 'text-white font-semibold underline underline-offset-4'
            : 'text-white/60 hover:text-white transition-colors'
        }
      >
        Visualisation
      </NavLink>
    </nav>
  )
}
