import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MinerLogs from './MinerLogs'
import DashboardCharts from '../components/DashboardCharts'
import SupervisorLeaveManagement from './SupervisorLeaveManagement'
import { useSensorData } from '../hooks/useSensorData'
import UserProfileModal from '../components/UserProfileModal'

function SupervisorDashboard({ onLogout, userId, isAdminView = false }) {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [miners, setMiners] = useState([])
  const [activeStatuses, setActiveStatuses] = useState({})
  const [notifications, setNotifications] = useState([])
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // Get sensor data for dashboard
  const { sensorData, getSensorStatus } = useSensorData(null, false)

  useEffect(() => {
    fetchUser()
    fetchMiners()
    fetchActiveStatuses()

    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    // Refresh active statuses periodically
    const statusInterval = setInterval(() => {
      fetchActiveStatuses()
    }, 30000) // Every 30 seconds

    // Poll for new leave applications every 15 seconds (fallback if real-time fails)
    const leavePollInterval = setInterval(() => {
      // This will trigger refresh when supervisor is on leave page
      // The LeaveApplication component handles its own polling
    }, 15000)

    // Subscribe to attendance changes for real-time updates
    const attendanceChannel = supabase
      .channel('attendance-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance'
        },
        () => {
          fetchActiveStatuses()
        }
      )
      .subscribe()

    // Subscribe to leave application notifications
    const leaveChannel = supabase
      .channel('supervisor-leave-notifications', {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leave_applications'
        },
        (payload) => {
          console.log('Leave application INSERT detected:', payload)
          handleNewLeaveApplication(payload.new)
        }
      )
      .subscribe(async (status) => {
        console.log('Leave channel subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to leave application notifications')
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.error('❌ Leave channel error:', status)
        }
      })

    // Also listen for broadcast messages (backup method)
    const notificationChannel = supabase.channel('supervisor-broadcast', {
      config: {
        broadcast: { self: true }
      }
    })
    notificationChannel
      .on('broadcast', { event: 'new-leave-application' }, (payload) => {
        console.log('Broadcast notification received:', payload)
        showNotification(payload.payload)
      })
      .subscribe(async (status) => {
        console.log('Broadcast channel subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to broadcast channel')
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.error('❌ Broadcast channel error:', status)
        }
      })

    return () => {
      clearInterval(timer)
      clearInterval(statusInterval)
      clearInterval(leavePollInterval)
      supabase.removeChannel(attendanceChannel)
      supabase.removeChannel(leaveChannel)
      supabase.removeChannel(notificationChannel)
    }
  }, [activePage])

  const handleNewLeaveApplication = async (application) => {
    try {
      console.log('New leave application received:', application)
      // Fetch miner details
      const { data: minerData, error: minerError } = await supabase
        .from('users')
        .select('full_name, employee_id')
        .eq('id', application.user_id)
        .single()

      if (minerError) {
        console.error('Error fetching miner data:', minerError)
      }

      if (minerData) {
        showNotification({
          application_id: application.id,
          miner_name: minerData.full_name || 'Unknown',
          employee_id: minerData.employee_id || 'N/A',
          start_date: application.start_date,
          end_date: application.end_date
        })
      } else {
        // Show notification even if miner data fetch fails
        showNotification({
          application_id: application.id,
          miner_name: 'Unknown Miner',
          employee_id: 'N/A',
          start_date: application.start_date,
          end_date: application.end_date
        })
      }
    } catch (error) {
      console.error('Error handling new leave application:', error)
      // Still show notification with basic info
      showNotification({
        application_id: application.id || 'unknown',
        miner_name: 'Unknown Miner',
        employee_id: 'N/A',
        start_date: application.start_date || 'N/A',
        end_date: application.end_date || 'N/A'
      })
    }
  }

  const showNotification = (data) => {
    const notification = {
      id: Date.now(),
      type: 'leave-application',
      message: `New leave application from ${data.miner_name} (${data.employee_id})`,
      details: data,
      timestamp: new Date()
    }
    setNotifications(prev => [notification, ...prev])

    // If supervisor is on leave application page, trigger a refresh
    // This will be handled by the LeaveApplication component's real-time subscription

    // Auto-remove notification after 10 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 10000)
  }

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const fetchUser = async () => {
    try {
      if (userId) {
        // Fetch specific user profile if userId is provided
        const { data: profile } = await supabase
          .from('users')
          .select('full_name, email, id, contact_number, blood_type, photo_url')
          .eq('id', userId)
          .single()

        if (profile) {
          setUser({ id: profile.id, email: profile.email })
          setUserProfile(profile)
        }
      } else {
        // Default: fetch logged-in user
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          setUser(authUser)
          const { data: profile } = await supabase
            .from('users')
            .select('full_name, email, contact_number, blood_type, photo_url')
            .eq('id', authUser.id)
            .single()
          if (profile) {
            setUserProfile(profile)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user:', error)
    }
  }

  const fetchMiners = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, employee_id')
        .eq('role', 'miner')
        .order('full_name', { ascending: true })

      if (error) {
        console.error('Error fetching miners:', error)
      } else {
        setMiners(data || [])
      }
    } catch (error) {
      console.error('Error fetching miners:', error)
    }
  }

  const fetchActiveStatuses = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('attendance')
        .select('user_id, entry_time, exit_time')
        .eq('date', today)

      if (error) {
        console.error('Error fetching active statuses:', error)
        return
      }

      // Create a map of user_id to active status
      const statusMap = {}
      if (data) {
        data.forEach(record => {
          // Active if entry_time exists and exit_time is null
          statusMap[record.user_id] = record.entry_time && !record.exit_time
        })
      }
      setActiveStatuses(statusMap)
    } catch (error) {
      console.error('Error in fetchActiveStatuses:', error)
    }
  }

  const handleLogout = async () => {
    if (isAdminView) {
      navigate('/admin')
      return
    }
    if (onLogout) {
      await onLogout()
    }
    navigate('/')
  }

  // Calculate sensor statuses for dashboard
  const mq2Status = getSensorStatus(sensorData.mq2, 300, 500)
  const mq9Status = getSensorStatus(sensorData.mq9, 200, 400)
  const mq135Status = getSensorStatus(sensorData.mq135, 400, 700)
  const tempStatus = getSensorStatus(sensorData.temperature, 35, 45)
  const humidityStatus = getSensorStatus(sensorData.humidity, 80, 95)

  const safeCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'safe').length
  const warningCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'warning').length
  const criticalCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'critical').length

  const allSystemsNormal = warningCount === 0 && criticalCount === 0

  // Calculate active miners count
  const activeMinersCount = miners.filter(miner => activeStatuses[miner.id]).length
  const totalMinersCount = miners.length
  const hasActiveMiners = activeMinersCount > 0

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'leave', label: 'Leave Management', icon: '📝' },
    { id: 'miner-logs', label: 'Miner Logs', icon: '📋' }
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-gray-800 text-white flex flex-col">
        {/* Logo Section */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">SIREN</h1>
              <p className="text-xs text-gray-400">Safety Monitoring</p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${activePage === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
                }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className={`w-full px-4 py-2 ${isAdminView ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-600 hover:bg-red-700'} text-white rounded-lg transition-colors font-medium`}
          >
            {isAdminView ? 'Back to Admin' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isAdminView && (
                <button
                  onClick={() => navigate('/admin')}
                  className="mr-2 px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 text-sm font-medium flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Back</span>
                </button>
              )}
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">SIREN</h1>
            </div>
            <div className="text-gray-600 flex items-center space-x-4">
              {isAdminView && <span className="mr-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">Admin View</span>}
              <button
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
                  {userProfile?.photo_url ? (
                    <img src={userProfile.photo_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                      {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                    </div>
                  )}
                </div>
                <span className="font-medium">{userProfile?.full_name || user?.email || 'Supervisor'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-20 right-6 z-50 space-y-2 max-w-md">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="bg-blue-600 text-white rounded-lg shadow-lg p-4 flex items-start space-x-3 transform transition-all duration-300 ease-in-out"
              >
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold">New Leave Application</p>
                  <p className="text-sm opacity-90">{notification.message}</p>
                  {notification.details && (
                    <p className="text-xs opacity-75 mt-1">
                      {new Date(notification.details.start_date).toLocaleDateString()} - {new Date(notification.details.end_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeNotification(notification.id)}
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

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {activePage === 'dashboard' && (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
                <p className="text-gray-600 mt-1">Personal status and safety monitoring</p>
              </div>

              {/* Overall System Status Card */}
              <div className={`rounded-lg p-6 shadow-md ${allSystemsNormal ? 'bg-green-500' : criticalCount > 0 ? 'bg-red-500' : 'bg-yellow-500'
                } text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">
                        {allSystemsNormal ? 'All Systems Normal' : criticalCount > 0 ? 'Critical Alert' : 'Warning Alert'}
                      </h3>
                      <p className="text-sm opacity-90 mt-1">Last updated: {formatTime(currentTime)}</p>
                    </div>
                  </div>
                  {allSystemsNormal && (
                    <div className="text-2xl">↑</div>
                  )}
                </div>
              </div>

              {/* Summary Status Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-500 rounded-lg p-6 text-white shadow-md">
                  <div className="text-4xl font-bold">{safeCount}</div>
                  <div className="text-lg font-medium mt-2">Safe</div>
                </div>
                <div className="bg-yellow-500 rounded-lg p-6 text-white shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-4xl font-bold">{warningCount}</div>
                      <div className="text-lg font-medium mt-2">Warning</div>
                    </div>
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="bg-red-500 rounded-lg p-6 text-white shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-4xl font-bold">{criticalCount}</div>
                      <div className="text-lg font-medium mt-2">Critical</div>
                    </div>
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Dashboard Charts Section */}
              <DashboardCharts />

              {/* Bottom Information Cards */}
              <div className="grid grid-cols-2 gap-4">
                {/* Active Alerts */}
                <div className="bg-white rounded-lg p-6 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
                    <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-4xl font-bold text-gray-900 mb-2">0</div>
                  <p className="text-sm text-gray-600">Requires attention</p>
                </div>

                {/* Shift Status */}
                <div className="bg-white rounded-lg p-6 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Active Miners</h3>
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className={`text-2xl font-bold mb-2 ${hasActiveMiners ? 'text-green-600' : 'text-gray-400'}`}>
                    {activeMinersCount} / {totalMinersCount}
                  </div>
                  <p className="text-sm text-gray-600">
                    {hasActiveMiners
                      ? `${activeMinersCount} miner${activeMinersCount !== 1 ? 's' : ''} currently on shift`
                      : 'No active miners'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}



          {/* Leave Management Page */}
          {activePage === 'leave' && (
            <SupervisorLeaveManagement />
          )}

          {/* Miner Logs Page */}
          {activePage === 'miner-logs' && (
            <MinerLogs />
          )}
        </main>
      </div>

      {/* Profile Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={{ ...user, ...userProfile }}
        onUpdate={() => {
          // Re-fetch user data logic
          const targetUserId = userId || user?.id
          if (targetUserId) {
            supabase.from('users').select('*').eq('id', targetUserId).single()
              .then(({ data }) => { if (data) setUserProfile(data) })
          }
        }}
      />
    </div>
  )
}

export default SupervisorDashboard

