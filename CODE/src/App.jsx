import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import MinerDashboard from './pages/MinerDashboard'
import SupervisorDashboard from './pages/SupervisorDashboard'
import AdminDashboard from './pages/AdminDashboard'
import MinerView from './pages/MinerView'
import { AdminMinerView, AdminSupervisorView } from './pages/AdminViews'
import AboutUs from './pages/AboutUs'
import LegalDisclosure from './pages/LegalDisclosure'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsConditions from './pages/TermsConditions'

import ScrollToTop from './components/ScrollToTop'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Check sessionStorage first for faster role access
        const storedRole = sessionStorage.getItem('userRole')
        if (storedRole && ['miner', 'supervisor', 'admin'].includes(storedRole)) {
          console.log('[INFO] Using role from sessionStorage:', storedRole)
          setUserRole(storedRole)
          setLoading(false)
        }
        fetchUserRole(session.user.id)
      } else {
        sessionStorage.removeItem('userRole')
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Check sessionStorage first for faster role access
        const storedRole = sessionStorage.getItem('userRole')
        if (storedRole && ['miner', 'supervisor', 'admin'].includes(storedRole)) {
          console.log('[INFO] Using role from sessionStorage:', storedRole)
          setUserRole(storedRole)
        }
        fetchUserRole(session.user.id)
      } else {
        sessionStorage.removeItem('userRole')
        setUserRole(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserRole = async (userId) => {
    try {
      console.log('[INFO] Fetching user role for userId:', userId)
      const { data, error } = await supabase
        .from('users')
        .select('role, email, full_name, deleted_at')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[ERROR] Error fetching user role:', error)
        setUserRole('miner')
      } else {
        // CHECK: Is the account soft-deleted?
        if (data?.deleted_at) {
          console.warn('[AUTH] Access denied: Account is in the trash.')
          alert('This account has been deactivated. Please contact an administrator.')
          handleLogout()
          return
        }

        console.log('[INFO] User data from database:', data)
        const role = (data?.role || 'miner').toLowerCase().trim()
        const validRoles = ['miner', 'supervisor', 'admin']

        if (validRoles.includes(role)) {
          setUserRole(role)
          sessionStorage.setItem('userRole', role)
        } else {
          setUserRole('miner')
          sessionStorage.setItem('userRole', 'miner')
        }
      }
    } catch (error) {
      console.error('[ERROR] Exception fetching user role:', error)
      setUserRole('miner') // Default role
    } finally {
      setLoading(false)
    }
  }

  // Helper function to get current role (checks both state and sessionStorage)
  const getCurrentRole = () => {
    if (userRole) return userRole
    const storedRole = sessionStorage.getItem('userRole')
    if (storedRole && ['miner', 'supervisor', 'admin'].includes(storedRole)) {
      return storedRole
    }
    return null
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Error signing out:', error)
      } else {
        // Clear user state and sessionStorage
        setUser(null)
        setUserRole(null)
        sessionStorage.removeItem('userRole')
        // Navigation will be handled by the route protection
      }
    } catch (error) {
      console.error('Error during logout:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Landing page - always accessible */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth page - redirect to dashboard if already logged in */}
        <Route
          path="/auth"
          element={
            user && getCurrentRole() ? (
              <Navigate to={`/${getCurrentRole()}`} replace />
            ) : (
              <AuthPage />
            )
          }
        />

        {/* Protected role-based dashboards */}
        <Route
          path="/miner"
          element={
            user && getCurrentRole() === 'miner' ? (
              <MinerDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" />
            )
          }
        />
        <Route
          path="/supervisor"
          element={
            user && getCurrentRole() === 'supervisor' ? (
              <SupervisorDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" />
            )
          }
        />
        <Route
          path="/supervisor/miners/:minerId"
          element={
            user && getCurrentRole() === 'supervisor' ? (
              <MinerView onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" />
            )
          }
        />
        <Route
          path="/admin"
          element={
            user && getCurrentRole() === 'admin' ? (
              <AdminDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" />
            )
          }
        />
        <Route
          path="/admin/miner/:minerId"
          element={
            user && getCurrentRole() === 'admin' ? (
              <AdminMinerView onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" />
            )
          }
        />
        <Route
          path="/admin/supervisor/:supervisorId"
          element={
            user && getCurrentRole() === 'admin' ? (
              <AdminSupervisorView onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" />
            )
          }
        />

        {/* Footer Pages */}
        <Route path="/about" element={<AboutUs />} />
        <Route path="/legal" element={<LegalDisclosure />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsConditions />} />

        {/* Catch all - redirect to landing */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App

