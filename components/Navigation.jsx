'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

// const tabs = [
//   { id: 'home', label: 'Home', path: '/' },
//   { id: 'search', label: 'Search', path: '/search' },
//   { id: 'reviews', label: 'Reviews', path: '/reviews' },
//   { id: 'offers', label: 'Offers', path: '/offers' },
//   { id: 'profile', label: 'Profile', path: '/profile' },
// ]

export default function Navigation({ children }) {
  // const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <main className="menu-card">
      <header className="menu-header">
        <div style={{ display: 'flex', justifyContent: 'center', flexDirection:'column', alignItems: 'center', width: '100%' }}>
           <div style={{ display: 'flex', alignItems: 'center',alignSelf:'end', gap: '10px' }}>
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="avatar"
                style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--orange)' }}
                referrerPolicy="no-referrer"
              />
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              style={{
                background: 'var(--orange)',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Sign Out
            </button>
          </div>
          <div>
            <h1>
              Welcome<br />To<br />Cravely
            </h1>
            <p>Student Food Discovery</p>
          </div>
         
        </div>
      </header>

      {/* <nav className="menu-nav">
        {tabs.map(tab => {
          const isActive = pathname === tab.path
          return (
            <Link
              key={tab.id}
              href={tab.path}
              className={isActive ? 'active' : ''}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav> */}

      {children}

      <footer className="menu-footer">
        <p>CRAVELY &middot; A College Project &middot; Work in Progress</p>
      </footer>
    </main>
  )
}

