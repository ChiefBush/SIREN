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
          console.log('📦 Using role from sessionStorage:', storedRole)
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
          console.log('📦 Using role from sessionStorage:', storedRole)
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
      console.log('🔍 Fetching user role for userId:', userId)
      const { data, error } = await supabase
        .from('users')
        .select('role, email, full_name')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('❌ Error fetching user role:', error)
        console.error('Error details:', error.message, error.code)
        // If user doesn't exist in users table, default to miner
        setUserRole('miner')
      } else {
        console.log('📊 User data from database:', data)
        console.log('📊 Raw role value:', data?.role, 'Type:', typeof data?.role)

        // Normalize role to lowercase to ensure it matches route protection
        const role = (data?.role || 'miner').toLowerCase().trim()
        const validRoles = ['miner', 'supervisor', 'admin']

        console.log('📊 Normalized role:', role)

        // Validate role
        if (validRoles.includes(role)) {
          console.log(`✅ Setting userRole to: "${role}"`)
          setUserRole(role)
          // Also store in sessionStorage for faster access
          sessionStorage.setItem('userRole', role)
        } else {
          console.error(`❌ INVALID ROLE: "${role}" is not in valid roles:`, validRoles)
          console.error('Raw role from DB:', data?.role)
          console.error('Full user data:', data)
          setUserRole('miner')
          sessionStorage.setItem('userRole', 'miner')
        }
      }
    } catch (error) {
      console.error('❌ Exception fetching user role:', error)
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

        {/* Catch all - redirect to landing */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App

