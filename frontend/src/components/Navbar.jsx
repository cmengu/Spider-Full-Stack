import { Link, NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-brand-border shadow-sm border-t-[3px] border-t-brand">
      <Link to="/" className="text-lg font-bold tracking-tight text-brand-heading">
        Hummingbird
      </Link>
      <NavLink
        to="/visualisation"
        className={({ isActive }) =>
          isActive
            ? 'text-brand font-semibold underline underline-offset-4 decoration-brand'
            : 'text-brand-text hover:text-brand-heading transition-colors'
        }
      >
        Visualisation
      </NavLink>
    </nav>
  )
}
