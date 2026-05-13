import { Link, NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
      <Link to="/" className="text-lg font-semibold text-gray-900">
        Hummingbird
      </Link>
      <NavLink
        to="/visualisation"
        className={({ isActive }) =>
          isActive
            ? 'text-gray-900 font-semibold underline underline-offset-4'
            : 'text-gray-600 hover:text-gray-900'
        }
      >
        Visualisation
      </NavLink>
    </nav>
  )
}
