import './globals.css'
import AuthProvider from '../components/AuthProvider'

export const metadata = {
  title: 'Cravely - Student Food Discovery',
  description: 'Find the best dishes near your college at the best prices',
}

export default function RootLayout({ children }) {

  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
