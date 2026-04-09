import './globals.css'
import AuthProvider from '../components/AuthProvider'
import { LocationScopeProvider } from '../components/LocationScopeProvider'

export const metadata = {
  title: 'Cravely - Student Food Discovery',
  description: 'Find the best dishes near your college at the best prices',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LocationScopeProvider>{children}</LocationScopeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
