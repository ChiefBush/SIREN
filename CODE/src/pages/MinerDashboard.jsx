import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SensorMetrics from './SensorMetrics'
import DashboardCharts from '../components/DashboardCharts'
import Attendance from './Attendance'
import MinerLeaveApplication from './MinerLeaveApplication'

function MinerDashboard({ onLogout, userId, isReadOnly = false }) {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isActive, setIsActive] = useState(false)

  // Synthetic sensor data
  const [sensorData, setSensorData] = useState({
    mq2: 0.0,
    mq9: 0.0,
    mq135: 0.0,
    temperature: 0.0,
    humidity: 0.0
  })

  // Fetch user profile - use userId prop if provided, else use logged-in user
  useEffect(() => {
    const fetchUser = async () => {
      if (userId) {
        // Fetch specific user by userId (for supervisor view)
        const { data: profile } = await supabase
          .from('users')
          .select('id, full_name, email')
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
          // Fetch user profile
          const { data: profile } = await supabase
            .from('users')
            .select('full_name, email')
            .eq('id', authUser.id)
            .single()
          if (profile) {
            setUserProfile(profile)
          }
        }
      }
    }
    fetchUser()
  }, [userId])

  // Fetch attendance status
  useEffect(() => {
    const fetchAttendanceStatus = async () => {
      const targetUserId = userId || user?.id
      if (!targetUserId) return

      try {
        const today = new Date().toISOString().split('T')[0]
        const { data, error } = await supabase
          .from('attendance')
          .select('entry_time, exit_time')
          .eq('user_id', targetUserId)
          .eq('date', today)
          .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          console.error('Error fetching attendance status:', error)
          return
        }

        // Active if entry_time exists and exit_time is null
        setIsActive(data ? (data.entry_time && !data.exit_time) : false)
      } catch (error) {
        console.error('Error in fetchAttendanceStatus:', error)
      }
    }

    if (user || userId) {
      fetchAttendanceStatus()
    }

    // Refresh attendance status periodically
    const interval = setInterval(() => {
      fetchAttendanceStatus()
    }, 30000) // Every 30 seconds

    // Subscribe to attendance changes for real-time updates
    const channel = supabase
      .channel('attendance-realtime-miner')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance'
        },
        () => {
          fetchAttendanceStatus()
        }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [user, userId])

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Simulate sensor data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSensorData({
        mq2: Math.random() * 200, // 0-200 ppm
        mq9: Math.random() * 150, // 0-150 ppm
        mq135: Math.random() * 300, // 0-300 ppm
        temperature: 20 + Math.random() * 15, // 20-35°C
        humidity: 40 + Math.random() * 40 // 40-80%
      })
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    // Only allow logout if not in read-only mode
    if (!isReadOnly && onLogout) {
      await onLogout()
      navigate('/')
    }
  }

  // Helper function to get sensor status
  const getSensorStatus = (value, warningThreshold, criticalThreshold) => {
    if (value >= criticalThreshold) return { status: 'critical', color: 'red', text: 'Critical' }
    if (value >= warningThreshold) return { status: 'warning', color: 'yellow', text: 'Warning' }
    return { status: 'safe', color: 'green', text: 'Safe' }
  }

  // Calculate summary counts
  const mq2Status = getSensorStatus(sensorData.mq2, 300, 500)
  const mq9Status = getSensorStatus(sensorData.mq9, 200, 400)
  const mq135Status = getSensorStatus(sensorData.mq135, 400, 700)
  const tempStatus = getSensorStatus(sensorData.temperature, 35, 45)
  const humidityStatus = getSensorStatus(sensorData.humidity, 80, 95)

  const safeCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'safe').length
  const warningCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'warning').length
  const criticalCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'critical').length

  const allSystemsNormal = warningCount === 0 && criticalCount === 0

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
    ...(isReadOnly ? [] : [
      { id: 'sensor-metrics', label: 'Sensor Metrics', icon: '📡' },
      { id: 'leave', label: 'Leave Application', icon: '📝' }
    ]),
    { id: 'attendance', label: 'Attendance', icon: '🕐' }
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

        {/* Logout Button - only show if not read-only */}
        {!isReadOnly && (
          <div className="p-4 border-t border-gray-700">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isReadOnly && (
                <button
                  onClick={() => navigate('/supervisor')}
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
              {isReadOnly && (
                <span className="ml-3 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  Read-Only View
                </span>
              )}
            </div>
            <div className="text-gray-600">
              {isReadOnly ? (
                <span>Viewing: {userProfile?.full_name || user?.email || 'Miner'}</span>
              ) : (
                <span>Welcome, {userProfile?.full_name || user?.email || 'User'}</span>
              )}
            </div>
          </div>
        </header>

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

              {/* Information Cards (Active Alerts & Shift Status) */}
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
                    <h3 className="text-lg font-semibold text-gray-900">Shift Status</h3>
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className={`text-2xl font-bold mb-2 ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                    {isActive ? 'Active' : 'Inactive'}
                  </div>
                  <p className="text-sm text-gray-600">
                    {isActive ? 'Current shift in progress' : 'No active shift'}
                  </p>
                </div>
              </div>
              {/* Health Monitoring Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Health Monitoring</h3>
                  <p className="text-gray-600 mt-1">Real-time health data from connected watches</p>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">{userProfile?.full_name || 'N/A'}</h4>
                      <p className="text-sm text-gray-500">{userProfile?.employee_id || 'N/A'}</p>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Heart Rate (BPM) */}
                    <div className="border-l-4 border-red-500 pl-4 bg-gray-50 p-4 rounded-r-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Heart Rate</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            <span className="text-red-600">--</span>
                            <span className="text-sm text-gray-500 ml-1">BPM</span>
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 italic">Placeholder - Watch data pending</p>
                    </div>

                    {/* SpO2 */}
                    <div className="border-l-4 border-blue-500 pl-4 bg-gray-50 p-4 rounded-r-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">SpO2</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            <span className="text-blue-600">--</span>
                            <span className="text-sm text-gray-500 ml-1">%</span>
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 italic">Placeholder - Watch data pending</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center text-xs text-gray-500">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Last updated: --</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dashboard Charts Section */}
              <DashboardCharts userId={userId} />
            </div>
          )}

          {/* Sensor Metrics Page */}
          {activePage === 'sensor-metrics' && !isReadOnly && (
            <SensorMetrics userId={userId} />
          )}

          {/* Attendance Page */}
          {activePage === 'attendance' && (
            <Attendance userId={userId} isReadOnly={isReadOnly} />
          )}

          {/* Leave Application Page */}
          {activePage === 'leave' && !isReadOnly && (
            <MinerLeaveApplication userId={userId} />
          )}

          {/* Placeholder for other pages */}
          {activePage !== 'dashboard' && (activePage !== 'sensor-metrics' || isReadOnly) && activePage !== 'attendance' && activePage !== 'leave' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {menuItems.find(item => item.id === activePage)?.label}
                </h2>
                <p className="text-gray-600">This page will be implemented soon.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default MinerDashboard
