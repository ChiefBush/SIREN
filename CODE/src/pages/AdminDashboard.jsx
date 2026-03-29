import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, sensorSupabase } from '../lib/supabase'
import Logo from '../components/Logo'
import UserProfileModal from '../components/UserProfileModal'
import ChatFloatingButton from '../components/ChatFloatingButton'
import Footer from '../components/Footer'
import EmergencyAlertModal from '../components/EmergencyAlertModal'
import SupervisorIncidentReports from './SupervisorIncidentReports'
import { usePredictions, getRiskDisplayLabel } from '../hooks/usePredictions'

function AdminDashboard({ onLogout }) {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)

  // Admin specific state
  const [users, setUsers] = useState([])
  const [deletedUsers, setDeletedUsers] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [roleFilter, setRoleFilter] = useState('All')
  const [activeMenuId, setActiveMenuId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // Emergency SOS state
  const [emergencyActive, setEmergencyActive] = useState(false)
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState(false)
  const [emergencyNotifications, setEmergencyNotifications] = useState([])
  const lastEmergencyIncidentRef = useRef(null)
  const lastAlertedEmergencyIdRef = useRef(null) // tracks last emergency row ID we showed the modal for

  // ML Predictions
  const { predictions, latestPrediction, loading: predictionsLoading } = usePredictions(null, 0.85)
  const criticalPredictions = predictions.filter(p => (p.risk_level === 'high' || p.risk_level === 'critical') && p.risk_score >= 0.85)
  const lastMLPredictionIdRef = useRef(null)

  const menuRef = useRef(null)

  // Auto-create a critical incident when emergency=true is detected
  const createEmergencyIncident = async (sensorRow) => {
    try {
      const dedupeKey = String(sensorRow?.id || sensorRow?.created_at || sensorRow?.Timestamp || Date.now())
      if (lastEmergencyIncidentRef.current === dedupeKey) return
      lastEmergencyIncidentRef.current = dedupeKey

      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { error } = await supabase.from('incidents').insert({
        incident_type: 'other',
        severity: 'critical',
        status: 'reported',
        location: 'Helmet Sensor Node',
        description: '🚨 AUTOMATIC EMERGENCY ALERT: Helmet SOS button triggered or fall detected. Emergency signal received from sensor data at ' + new Date().toLocaleString() + '. Immediate response required.',
        date: new Date().toISOString().split('T')[0],
        reported_by: authUser?.id || null
      })
      if (error) {
        console.error('[SIREN] Admin: Failed to auto-create emergency incident:', error)
      } else {
        console.log('[SIREN] Admin: Emergency incident created successfully')
      }
    } catch (err) {
      console.error('[SIREN] Admin: Error in createEmergencyIncident:', err)
    }
  }

  // Show a red SOS toast notification
  const showEmergencyNotification = () => {
    const notifId = `emergency-${Date.now()}`
    setEmergencyNotifications(prev => {
      if (prev.some(n => n.type === 'emergency')) return prev // don't stack
      setTimeout(() => setEmergencyNotifications(cur => cur.filter(n => n.id !== notifId)), 30000)
      return [{ id: notifId, message: '🚨 Emergency SOS triggered — helmet button pressed or fall detected!', timestamp: new Date(), type: 'emergency' }, ...prev]
    })
  }

  const showMLNotification = (prediction) => {
    const notifId = `ml-${prediction.id}`
    setEmergencyNotifications(prev => {
      if (prev.some(n => n.id === notifId)) return prev
      setTimeout(() => setEmergencyNotifications(cur => cur.filter(n => n.id !== notifId)), 15000)
      return [{ 
        id: notifId, 
        message: `🤖 AI Predictive Signal: ${prediction.prediction_type.replace(/_/g, ' ')} detected. Assessment: ${getRiskDisplayLabel(prediction.risk_level)}`,
        timestamp: new Date(),
        type: 'ml'
      }, ...prev]
    })
  }

  useEffect(() => {
    if (latestPrediction) {
      if (!lastMLPredictionIdRef.current) {
         lastMLPredictionIdRef.current = latestPrediction.id
      } else if (lastMLPredictionIdRef.current !== latestPrediction.id) {
         lastMLPredictionIdRef.current = latestPrediction.id
         if ((latestPrediction.risk_level === 'high' || latestPrediction.risk_level === 'critical') && latestPrediction.risk_score >= 0.85) {
            showMLNotification(latestPrediction)
         }
      }
    }
  }, [latestPrediction])

  useEffect(() => {
    fetchCurrentUser()
    cleanupExpiredUsers()
    fetchAllUsers()
    fetchActivityLogs()

    // --- Emergency polling (runs every 15s — reliable even without Supabase Realtime) ---
    const pollEmergency = async () => {
      try {
        const { data, error } = await sensorSupabase
          .from('sensor_data')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (error) {
          // Fallback: try Timestamp (capital T)
          const { data: data2, error: error2 } = await sensorSupabase
            .from('sensor_data')
            .select('*')
            .order('Timestamp', { ascending: false })
            .limit(1)
            .single()

          if (error2) {
            console.error('[SIREN] Admin: Emergency poll failed:', error, error2)
            return
          }
          console.log('[SIREN] Admin: Emergency poll row:', data2)
          const isEmergency = data2?.emergency === true || data2?.emergency === 'true' || data2?.emergency === 1
          if (isEmergency) {
            const rowId = String(data2?.id || data2?.created_at || '')
            if (rowId !== lastAlertedEmergencyIdRef.current) {
              lastAlertedEmergencyIdRef.current = rowId
              setEmergencyActive(true)
              setEmergencyAcknowledged(false)
              showEmergencyNotification()
              createEmergencyIncident(data2)
            }
          }
          return
        }

        console.log('[SIREN] Admin: Emergency poll row:', data)
        const isEmergency = data?.emergency === true || data?.emergency === 'true' || data?.emergency === 1
        if (isEmergency) {
          const rowId = String(data?.id || data?.created_at || '')
          if (rowId !== lastAlertedEmergencyIdRef.current) {
            lastAlertedEmergencyIdRef.current = rowId
            setEmergencyActive(true)
            setEmergencyAcknowledged(false)
            showEmergencyNotification()
            createEmergencyIncident(data)
          }
        }
      } catch (e) {
        console.error('[SIREN] Admin: Emergency poll exception:', e)
      }
    }

    pollEmergency()
    const emergencyPollInterval = setInterval(pollEmergency, 15000)

    // Realtime as bonus
    const emergencyChannel = sensorSupabase
      .channel('admin-emergency-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sensor_data'
      }, (payload) => {
        console.log('[SIREN] Admin: Realtime emergency event:', payload.new)
        if (payload.new?.emergency === true || payload.new?.emergency === 'true' || payload.new?.emergency === 1) {
          const rowId = String(payload.new?.id || payload.new?.created_at || '')
          if (rowId !== lastAlertedEmergencyIdRef.current) {
            lastAlertedEmergencyIdRef.current = rowId
            setEmergencyActive(true)
            setEmergencyAcknowledged(false)
            showEmergencyNotification()
            createEmergencyIncident(payload.new)
          }
        }
      })
      .subscribe((status) => {
        console.log('[SIREN] Admin: Emergency channel status:', status)
      })

    // Click outside listener to close menus
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      clearInterval(emergencyPollInterval)
      sensorSupabase.removeChannel(emergencyChannel)
    }
  }, [])

  const fetchActivityLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setActivityLogs(data || [])
    } catch (error) {
      console.error('Error fetching activity logs:', error)
      // Mock data if table doesn't exist
      setActivityLogs([])
    }
  }

  const logAdminActivity = async (targetUser, action, details) => {
    try {
      const { error } = await supabase
        .from('admin_activity_logs')
        .insert({
          admin_id: user?.id,
          admin_name: userProfile?.full_name || user?.email || 'Admin',
          target_user_id: targetUser?.id,
          target_user_name: targetUser?.full_name || targetUser?.email || 'N/A',
          action: action,
          details: details
        })

      if (error) throw error
      fetchActivityLogs()
    } catch (error) {
      console.error('Error recording admin activity:', error)
    }
  }

  const fetchCurrentUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single()
        if (profile) {
          setUserProfile(profile)
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error)
    }
  }

  const cleanupExpiredUsers = async () => {
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { error } = await supabase
        .from('users')
        .delete()
        .lt('deleted_at', thirtyDaysAgo.toISOString())

      if (error) throw error
    } catch (error) {
      console.error('Error during database cleanup:', error)
    }
  }

  const fetchAllUsers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const now = new Date()
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

      // Separate active and recently deleted users
      const active = (data || []).filter(u => !u.deleted_at)
      const deleted = (data || []).filter(u => {
        if (!u.deleted_at) return false
        const deleteDate = new Date(u.deleted_at)
        return (now - deleteDate) < thirtyDaysMs
      })

      setUsers(active)
      setDeletedUsers(deleted)
    } catch (error) {
      console.error('Error fetching logs:', error)
      setUsers([
        { id: '1', full_name: 'John Doe', role: 'miner', employee_id: 'MIN-001' },
        { id: '2', full_name: 'Jane Smith', role: 'supervisor', employee_id: 'SUP-001' },
        { id: '3', full_name: 'Admin User', role: 'admin', employee_id: 'ADM-001' },
      ])
      setDeletedUsers([])
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout()
    }
    navigate('/')
  }

  const handleAction = (action, targetUser) => {
    if (action === 'Edit') {
      setEditingUser(targetUser)
      setIsProfileOpen(true)
    } else if (action === 'Delete') {
      handleDeleteUser(targetUser)
    }
    setActiveMenuId(null)
  }

  const handleDeleteUser = async (targetUser) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to move user ${targetUser.full_name || targetUser.email} to the trash? They can be restored within 30 days.`
    )

    if (confirmDelete) {
      try {
        setLoading(true)
        const { error } = await supabase
          .from('users')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', targetUser.id)

        if (error) throw error

        alert('User moved to trash successfully')
        logAdminActivity(targetUser, 'DELETE_USER', 'Moved user to the trash (soft-delete)')
        fetchAllUsers() // Refresh the list
      } catch (error) {
        console.error('Error deleting user:', error)
        alert('Failed to delete user: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleRestoreUser = async (targetUser) => {
    try {
      setLoading(true)
      const { error } = await supabase
        .from('users')
        .update({ deleted_at: null })
        .eq('id', targetUser.id)

      if (error) throw error

      alert('User restored successfully')
      logAdminActivity(targetUser, 'RESTORE_USER', 'Restored user from trash')
      fetchAllUsers()
    } catch (error) {
      console.error('Error restoring user:', error)
      alert('Failed to restore user: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const [editingUser, setEditingUser] = useState(null)

  const filteredUsers = users.filter(user => {
    if (roleFilter === 'All') return true
    return user.role?.toLowerCase() === roleFilter.toLowerCase()
  })

  const handleRowClick = (userItem) => {
    // Prevent navigation if menu or modal is open
    if (activeMenuId) return

    if (userItem.role?.toLowerCase() === 'miner') {
      navigate(`/admin/miner/${userItem.id}`)
    } else if (userItem.role?.toLowerCase() === 'supervisor') {
      navigate(`/admin/supervisor/${userItem.id}`)
    }
  }

  const menuItems = [
    { id: 'dashboard', label: 'User Logs', icon: null },
    { id: 'activity', label: 'Activity Logs', icon: null },
    { id: 'incidents', label: 'Incident Reports', icon: null },
    { id: 'prediction-history', label: 'ML Analytics History', icon: null }
  ]

  const getRoleBadgeColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin': return 'bg-red-100 text-red-800'
      case 'supervisor': return 'bg-purple-100 text-purple-800'
      case 'miner': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-blue-950 text-white flex flex-col shadow-2xl">
        {/* Logo Section */}
        <div className="h-24 flex items-center px-6 border-b border-blue-900/50">
          <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <Logo className="h-16" />
            <div>
              <h1 className="text-xl font-bold">SIREN</h1>
              <p className="text-xs text-blue-300">Admin Portal</p>
            </div>
          </Link>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${activePage === item.id
                ? 'bg-blue-600 text-white'
                : 'text-blue-100 hover:bg-blue-900/50'
                }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="h-20 flex items-center px-4 border-t border-blue-900/50">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 h-24 flex items-center">
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="text-gray-600 flex items-center space-x-4">
              {/* Emergency active badge */}
              {emergencyActive && (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                  <span className="w-2 h-2 bg-white rounded-full inline-block animate-ping" />
                  EMERGENCY ACTIVE
                </span>
              )}

              <button
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                  <div className="text-xs font-bold text-blue-600 uppercase">
                    {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </div>
                </div>
                <span className="font-medium">{userProfile?.full_name || user?.email || 'Admin'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Emergency SOS Notifications */}
        {emergencyNotifications.length > 0 && (
          <div className="fixed top-20 right-6 z-50 space-y-2 max-w-md">
            {emergencyNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  setActivePage(notif.type === 'ml' ? 'prediction-history' : 'incidents')
                  setEmergencyNotifications(prev => prev.filter(n => n.id !== notif.id))
                }}
                className={`${notif.type === 'ml' ? 'bg-orange-600 hover:bg-orange-700 border-orange-400' : 'bg-red-600 hover:bg-red-700 border-red-400'} text-white rounded-lg shadow-lg p-4 flex items-start space-x-3 cursor-pointer animate-pulse border-2 transition-all`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {notif.type === 'ml' ? (
                     <span className="text-xl">🤖</span>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-bold">{notif.type === 'ml' ? '🤖 AI Early Warning' : '🚨 Emergency SOS Alert'}</p>
                  <p className="text-sm opacity-90">{notif.message}</p>
                  <p className="text-xs opacity-75 mt-1 font-bold">{notif.type === 'ml' ? 'Click to view ML Analytics →' : 'Click to view Incident Reports →'}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setEmergencyNotifications(prev => prev.filter(n => n.id !== notif.id)) }}
                  className="flex-shrink-0 text-white hover:text-gray-200"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {activePage === 'dashboard' && (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Dashboard Overview</h2>
                <p className="text-gray-600 mt-1">Manage and monitor system users, roles, and real-time alerts</p>
              </div>

              {/* Early Warnings Widget */}
              {(criticalPredictions.length > 0) && (
                <div className="bg-white rounded-lg shadow-md border border-orange-200 overflow-hidden mb-8">
                  <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-orange-200 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        AI Predictive Risk Signals
                      </h3>
                      <p className="text-sm text-orange-700">AI-assessed environmental risk conditions — advisory only.</p>
                    </div>
                    <span className="bg-orange-600 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse shadow-sm">
                      {criticalPredictions.length} Active
                    </span>
                  </div>
                  <div className="divide-y divide-orange-100">
                    {criticalPredictions.slice(0, 5).map(pred => (
                      <div key={pred.id} className="p-4 hover:bg-orange-50/50 transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-sm
                            ${pred.risk_level === 'critical' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-orange-100 text-orange-700 border border-orange-200'}
                          `}>
                            !
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-sm capitalize">{pred.prediction_type.replace(/_/g, ' ')}</h4>
                            <p className="text-xs text-gray-500 font-medium">Miner: {pred.users?.full_name || 'Global Area'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${pred.risk_level === 'critical' ? 'text-red-600' : 'text-orange-600'}`}>
                            {getRiskDisplayLabel(pred.risk_level)}
                          </div>
                          <div className="text-xs text-gray-400 font-medium">
                            {(pred.risk_score * 100).toFixed(0)}% · {new Date(pred.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-8">
                  <h3 className="text-xl font-bold text-gray-900">User Logs</h3>
              </div>

              {/* Filter Controls */}
              <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm w-fit border border-gray-200">
                {['All', 'Miner', 'Supervisor', 'Admin'].map(role => (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${roleFilter === role
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              {/* Users Log Table */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-visible">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Name</th>
                        <th className="px-6 py-4 font-semibold">Unique ID</th>
                        <th className="px-6 py-4 font-semibold">Role</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {loading ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                            Loading user data...
                          </td>
                        </tr>
                      ) : filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                            No users found with role "{roleFilter}"
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((userItem) => (
                          <tr
                            key={userItem.id}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => handleRowClick(userItem)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold mr-3">
                                  {userItem.full_name?.charAt(0) || userItem.email?.charAt(0) || '?'}
                                </div>
                                <div className="font-medium text-gray-900">{userItem.full_name || 'N/A'}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm font-mono text-gray-600">
                              {userItem.employee_id || userItem.id?.slice(0, 8) || 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(userItem.role)}`}>
                                {userItem.role || 'Unassigned'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right relative">
                              <div
                                className="inline-block relative"
                                ref={activeMenuId === userItem.id ? menuRef : null}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveMenuId(activeMenuId === userItem.id ? null : userItem.id)
                                  }}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                                >
                                  <span className="text-xl font-bold leading-none">⋮</span>
                                </button>

                                {activeMenuId === userItem.id && (
                                  <div
                                    className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200 ring-1 ring-black ring-opacity-5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => handleAction('Edit', userItem)}
                                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleAction('Delete', userItem)}
                                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                  Showing {filteredUsers.length} {roleFilter === 'All' ? 'users' : roleFilter.toLowerCase() + ' accounts'}
                </div>
              </div>

              {/* Deleted Users Section */}
              {deletedUsers.length > 0 && (
                <div className="pt-8 border-t border-gray-200">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">Deleted Accounts</h2>
                    <p className="text-gray-600 mt-1">Users in this list will be permanently purged after 30 days.</p>
                  </div>

                  <div className="bg-white rounded-lg shadow-md border border-red-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-red-50/50 border-b border-red-100 text-red-900/60 text-xs uppercase tracking-wider">
                            <th className="px-6 py-4 font-semibold">User</th>
                            <th className="px-6 py-4 font-semibold">Deleted</th>
                            <th className="px-6 py-4 font-semibold">Auto-Purge In</th>
                            <th className="px-6 py-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {deletedUsers.map((userItem) => {
                            const daysDeleted = Math.floor((new Date() - new Date(userItem.deleted_at)) / (1000 * 60 * 60 * 24))
                            const daysLeft = 30 - daysDeleted

                            return (
                              <tr key={userItem.id} className="bg-gray-50/30">
                                <td className="px-6 py-4">
                                  <div className="flex items-center opacity-75">
                                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 font-bold mr-3">
                                      {userItem.full_name?.charAt(0) || userItem.email?.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-700">{userItem.full_name || 'N/A'}</div>
                                      <div className="text-xs text-gray-400">{userItem.role}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                  {daysDeleted === 0 ? 'Today' : `${daysDeleted} ${daysDeleted === 1 ? 'day' : 'days'} ago`}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${daysLeft <= 5 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {daysLeft} days
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    onClick={() => handleRestoreUser(userItem)}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-bold bg-white px-3 py-1.5 rounded-lg transition-colors border border-blue-200 shadow-sm hover:shadow"
                                  >
                                    Restore Account
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {activePage === 'activity' && (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Activity Logs</h2>
                <p className="text-gray-600 mt-1">Audit trail of all administrative actions and system changes</p>
              </div>

              {/* Activity Logs Table */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Timestamp</th>
                        <th className="px-6 py-4 font-semibold">Administrator</th>
                        <th className="px-6 py-4 font-semibold">Action</th>
                        <th className="px-6 py-4 font-semibold">Target User</th>
                        <th className="px-6 py-4 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {activityLogs.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-gray-500 italic">
                            No activity logs recorded yet.
                          </td>
                        </tr>
                      ) : (
                        activityLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-xs text-gray-500 font-medium whitespace-nowrap">
                              <div>{new Date(log.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                              <div className="text-gray-400 font-mono">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 mr-2">
                                  {log.admin_name?.charAt(0)}
                                </div>
                                <span className="text-sm font-semibold text-gray-900">{log.admin_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 text-[10px] font-black rounded-full uppercase tracking-tighter ${log.action === 'DELETE_USER' ? 'bg-red-100 text-red-700' :
                                log.action === 'RESTORE_USER' ? 'bg-green-100 text-green-700' :
                                  log.action === 'EDIT_PROFILE' ? 'bg-blue-100 text-blue-700' :
                                    log.action === 'DELETE_MESSAGE' ? 'bg-rose-100 text-rose-700' :
                                      log.action === 'BULK_DELETE_MESSAGES' ? 'bg-rose-200 text-rose-800' :
                                        log.action === 'RESOLVE_INCIDENT' ? 'bg-green-100 text-green-700' :
                                          log.action === 'BULK_RESOLVE_INCIDENTS' ? 'bg-green-200 text-green-800' :
                                            log.action === 'DELETE_INCIDENT' ? 'bg-orange-100 text-orange-700' :
                                              log.action === 'BULK_DELETE_INCIDENTS' ? 'bg-orange-200 text-orange-800' :
                                                log.action === 'EDIT_INCIDENT' ? 'bg-blue-100 text-blue-700' :
                                                  log.action === 'ACCEPT_LEAVE' ? 'bg-green-100 text-green-700' :
                                                    log.action === 'REJECT_LEAVE' ? 'bg-red-100 text-red-700' :
                                                      'bg-gray-100 text-gray-700'
                                }`}>
                                {log.action?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                              {log.target_user_name}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                              {log.details}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {activePage === 'prediction-history' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">AI Predictive Risk History</h2>
                <p className="text-gray-600 mt-1">Audit trail of AI-assessed risk conditions — advisory only</p>
              </div>

              <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Timestamp</th>
                        <th className="px-6 py-4 font-semibold">Risk Assessment</th>
                        <th className="px-6 py-4 font-semibold">Prediction Type</th>
                        <th className="px-6 py-4 font-semibold">Location / UID</th>
                        <th className="px-6 py-4 font-semibold">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {predictions.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-gray-500 italic">
                            No AI risk predictions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        predictions.map((pred) => (
                          <tr key={pred.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-xs text-gray-500 font-medium whitespace-nowrap">
                              <div>{new Date(pred.created_at).toLocaleDateString()}</div>
                              <div className="text-gray-400 font-mono">{new Date(pred.created_at).toLocaleTimeString()}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 text-xs font-bold rounded-full uppercase ${
                                pred.risk_level === 'critical' ? 'bg-red-100 text-red-700' :
                                pred.risk_level === 'high' ? 'bg-orange-100 text-orange-700' :
                                pred.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {getRiskDisplayLabel(pred.risk_level)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold capitalize text-gray-800">
                              {pred.prediction_type.replace(/_/g, ' ')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                               {pred.users?.full_name || pred.details?.hardware_node_id || pred.miner_id?.slice(0,8) || 'Global Area'}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-700">
                               {(pred.risk_score * 100).toFixed(0)}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {activePage === 'incidents' && (
            <SupervisorIncidentReports isAdmin={true} userId={user?.id} onActivityLog={logAdminActivity} />
          )}
        </main>
        <Footer />
      </div>

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false)
          setEditingUser(null)
        }}
        user={editingUser || { ...user, ...userProfile }}
        onUpdate={() => {
          if (editingUser) {
            logAdminActivity(editingUser, 'EDIT_PROFILE', 'Updated user profile information or system role')
          }
          fetchCurrentUser()
          fetchAllUsers()
        }}
        isAdminView={!!editingUser}
      />

      {/* Chat Functionality */}
      {user && <ChatFloatingButton currentUser={user} onActivityLog={logAdminActivity} />}

      {/* Emergency SOS Popup Alert */}
      <EmergencyAlertModal
        isOpen={emergencyActive && !emergencyAcknowledged}
        onDismiss={() => setEmergencyAcknowledged(true)}
      />
    </div>
  )
}

export default AdminDashboard
