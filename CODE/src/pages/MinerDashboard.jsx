import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SensorMetrics from './SensorMetrics'
import DashboardCharts from '../components/DashboardCharts'
import Attendance from './Attendance'
import MinerLeaveApplication from './MinerLeaveApplication'
import Logo from '../components/Logo'
import WatchMessageDisplay from '../components/WatchMessageDisplay'
import UserProfileModal from '../components/UserProfileModal'
import Footer from '../components/Footer'
import { useSensorData } from '../hooks/useSensorData'

function MinerDashboard({ onLogout, userId, isReadOnly = false, isAdminView = false, embedded = false }) {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [, setCurrentTime] = useState(new Date())
  const [isActive, setIsActive] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // Fetch sensor data using the shared hook
  const { sensorData, sensorHistory, getSensorStatus } = useSensorData(userId || user?.id, userProfile?.email)

  // Fetch user profile - use userId prop if provided, else use logged-in user
  useEffect(() => {
    const fetchUser = async () => {
      if (userId) {
        // Fetch specific user by userId (for supervisor view)
        const { data: profile } = await supabase
          .from('users')
          .select('*')
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
            .select('*')
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

  // Fetch user role for profile modal update
  const fetchUserRole = async () => {
    const targetUserId = userId || user?.id
    if (targetUserId) {
      const { data: profile } = await supabase.from('users').select('*').eq('id', targetUserId).single()
      if (profile) setUserProfile(profile)
    }
  }

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


  const handleLogout = async () => {
    if (isAdminView) {
      navigate('/admin')
      return
    }
    // Only allow logout if not in read-only mode
    if (!isReadOnly && onLogout) {
      await onLogout()
      navigate('/')
    }
  }


  // Calculate sensor statuses. Treat zero / no-data as offline instead of safe.
  const getSensorStatusWithOffline = (value, warning, critical) => {
    if (value === 0 || value == null || Number.isNaN(value)) {
      return { status: 'offline', color: 'gray', text: 'Offline' }
    }
    return getSensorStatus(value, warning, critical)
  }

  const mq2Status = getSensorStatusWithOffline(sensorData.mq2, 300, 500)
  const mq9Status = getSensorStatusWithOffline(sensorData.mq9, 200, 400)
  const mq135Status = getSensorStatusWithOffline(sensorData.mq135, 400, 700)
  const tempStatus = getSensorStatusWithOffline(sensorData.temperature, 35, 45)
  const humidityStatus = getSensorStatusWithOffline(sensorData.humidity, 80, 95)

  const safeCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'safe').length
  const warningCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'warning').length
  const criticalCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'critical').length
  const offlineCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'offline').length

  const allSystemsNormal = safeCount > 0 && warningCount === 0 && criticalCount === 0

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: null },
    ...((isReadOnly && !isAdminView) ? [] : [
      { id: 'sensor-metrics', label: 'Sensor Metrics', icon: null },
      { id: 'leave', label: 'Leave Application', icon: null }
    ]),
    { id: 'attendance', label: 'Attendance', icon: null }
  ]

  const renderContent = () => {
    return (
      <div className="space-y-6">
        {activePage === 'dashboard' && (
          <div className="space-y-6">
            {/* Emergency Alert Banner */}
            {sensorData.emergency && (
              <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between animate-pulse">
                <div className="flex items-center space-x-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h3 className="text-xl font-bold">EMERGENCY DETECTED</h3>
                    <p className="text-sm opacity-90">An emergency signal has been triggered from your device!</p>
                  </div>
                </div>
                <div className="text-sm font-mono bg-white bg-opacity-20 px-3 py-1 rounded">
                  ACTIVE
                </div>
              </div>
            )}

            {/* Page Title & System Status */}
            {!embedded && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
                  <p className="text-gray-600 mt-1">Personal status and safety monitoring</p>
                </div>

                {/* Compact System Status Badge */}
                <div className={`rounded-xl px-6 py-3 shadow-md border ${!sensorData.wristbandConnected ? 'bg-gray-500 border-gray-600' : allSystemsNormal ? 'bg-green-500 border-green-600' : criticalCount > 0 ? 'bg-red-500 border-red-600' : 'bg-yellow-500 border-yellow-600'
                  } text-white min-w-[240px]`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold leading-tight">
                        {!sensorData.wristbandConnected ? 'Device Offline' : allSystemsNormal ? 'All Systems Normal' : criticalCount > 0 ? 'Critical Alert' : 'Warning Alert'}
                      </h3>
                      <p className="text-[10px] opacity-90 font-medium uppercase tracking-wider">
                        {sensorHistory.length > 0 && sensorData.wristbandConnected
                          ? `Last data: ${formatTime(sensorHistory[sensorHistory.length - 1].time)}`
                          : !sensorData.wristbandConnected
                            ? 'Connect wristband to monitor'
                            : 'Waiting for sensor data...'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Status Cards */}
            <div className={`grid ${embedded ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'} gap-4`}>
              {!sensorData.wristbandConnected ? (
                <div className="col-span-3 bg-gray-400 rounded-lg p-6 text-white shadow-md border-b-4 border-gray-500">
                  <div className="flex items-center justify-center space-x-3">
                    <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-7.072 2.829a5 5 0 010-7.072m0 0l2.829-2.829M12 12h.01" />
                    </svg>
                    <div className="text-center">
                      <div className="text-2xl font-bold">Device Offline</div>
                      <div className="text-sm opacity-90 mt-1">No active wristband connection. Alerts are paused.</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`rounded-lg p-6 text-white shadow-md border-b-4 ${safeCount > 0 ? 'bg-green-500 border-green-600' : 'bg-gray-300 border-gray-400'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-4xl font-bold">{safeCount}</div>
                        <div className="text-sm font-medium mt-1 opacity-90">Sensors Normal</div>
                        <div className="text-[10px] opacity-75 mt-1 uppercase tracking-wider">out of 5 sensors</div>
                      </div>
                      <svg className="w-10 h-10 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className={`rounded-lg p-6 text-white shadow-md border-b-4 ${warningCount > 0 ? 'bg-yellow-500 border-yellow-600' : 'bg-gray-300 border-gray-400'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-4xl font-bold">{warningCount}</div>
                        <div className="text-sm font-medium mt-1 opacity-90">Sensor Warnings</div>
                        <div className="text-[10px] opacity-75 mt-1 uppercase tracking-wider">live thresholds exceeded</div>
                      </div>
                      <svg className="w-10 h-10 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className={`rounded-lg p-6 text-white shadow-md border-b-4 ${criticalCount > 0 ? 'bg-red-500 border-red-600' : 'bg-gray-300 border-gray-400'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-4xl font-bold">{criticalCount}</div>
                        <div className="text-sm font-medium mt-1 opacity-90">Sensor Critical</div>
                        <div className="text-[10px] opacity-75 mt-1 uppercase tracking-wider">live critical thresholds</div>
                      </div>
                      <svg className="w-10 h-10 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Information Cards (Active Alerts & Shift Status) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Active Alerts */}
              <div className="bg-white rounded-lg p-6 shadow-md border border-gray-100 transition-hover hover:shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 uppercase tracking-tighter">Active Alerts</h3>
                  <div className="p-2 bg-yellow-50 rounded-lg">
                    <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-end space-x-2">
                  <div className="text-5xl font-black text-gray-950">0</div>
                  <p className="text-gray-500 font-medium mb-1">active notifications</p>
                </div>
              </div>

              {/* Shift Status */}
              <div className="bg-white rounded-lg p-6 shadow-md border border-gray-100 transition-hover hover:shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 uppercase tracking-tighter">Shift Status</h3>
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <svg className={`w-6 h-6 ${isActive ? 'text-green-500 animate-spin-slow' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className={`text-3xl font-black mb-1 ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                  {isActive ? 'Active Duty' : 'Off Duty'}
                </div>
                <p className="text-sm text-gray-600 font-medium italic opacity-75">
                  {isActive ? 'Current tracking in progress' : 'Check in to start logging'}
                </p>
              </div>
            </div>

            {/* Health Monitoring Section */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
                <h3 className="text-xl font-bold text-gray-900">Health Monitoring</h3>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border border-gray-100 transition-hover hover:shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-black text-xl border-2 border-blue-100">
                      {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-gray-900 leading-none">{userProfile?.full_name || 'N/A'}</h4>
                      <p className="text-sm text-gray-400 mt-1 font-mono tracking-tighter">{userProfile?.employee_id || 'ID: UNKNOWN'}</p>
                    </div>
                  </div>
                  <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${sensorData.wristbandConnected && sensorData.bpm > 0 && sensorData.spo2 > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${sensorData.wristbandConnected && sensorData.bpm > 0 && sensorData.spo2 > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                    <span>{sensorData.wristbandConnected && sensorData.bpm > 0 && sensorData.spo2 > 0 ? 'SMARTBAND ACTIVE' : 'BAND DISCONNECTED'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Heart Rate (BPM) */}
                  <div className="group relative bg-gray-50/50 p-6 rounded-2xl border-2 border-transparent transition-all hover:border-red-100 hover:bg-red-50/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Heart Pulse</p>
                        <div className="flex items-baseline space-x-1">
                          <span className={`text-5xl font-black ${sensorData.bpm ? 'text-red-600' : 'text-gray-300'}`}>{sensorData.bpm || '--'}</span>
                          <span className="text-sm font-bold text-gray-400 uppercase">bpm</span>
                        </div>
                      </div>
                      <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* SpO2 */}
                  <div className="group relative bg-gray-50/50 p-6 rounded-2xl border-2 border-transparent transition-all hover:border-blue-100 hover:bg-blue-50/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Oxygen Saturation</p>
                        <div className="flex items-baseline space-x-1">
                          <span className={`text-5xl font-black ${sensorData.spo2 ? 'text-blue-600' : 'text-gray-300'}`}>{sensorData.spo2 || '--'}</span>
                          <span className="text-sm font-bold text-gray-400 uppercase">%</span>
                        </div>
                      </div>
                      <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>


              </div>
            </div>

            {/* Charts Section */}
            <DashboardCharts userId={userId || user?.id} userEmail={userProfile?.email} stacked={embedded} />
          </div>
        )}

        {activePage === 'sensor-metrics' && (
          <SensorMetrics userId={userId || user?.id} userEmail={userProfile?.email} />
        )}
        {activePage === 'attendance' && (
          <Attendance userId={userId || user?.id} isReadOnly={isReadOnly} />
        )}
        {activePage === 'leave' && (
          <MinerLeaveApplication userId={userId || user?.id} />
        )}
      </div>
    )
  }

  if (embedded) {
    return (
      <div className="bg-gray-50 overflow-y-auto h-full w-full">
        <div className="p-4">
          {renderContent()}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Message Display for Miner */}
      {!isReadOnly && !isAdminView && user?.id && <WatchMessageDisplay userId={user.id} />}

      {/* Left Sidebar */}
      <div className="w-64 bg-blue-950 text-white flex flex-col shadow-2xl">
        <div className="h-24 flex items-center px-6 border-b border-blue-900/50">
          <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <Logo className="h-16" />
            <div>
              <h1 className="text-xl font-bold">SIREN</h1>
              <p className="text-xs text-blue-300">Miner Portal</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-lg mb-2 transition-all ${activePage === item.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-blue-100 hover:bg-white/10'
                }`}
            >
              <span className="font-bold">{item.label}</span>
            </button>
          ))}
        </nav>

        {(!isReadOnly || isAdminView) && (
          <div className="p-4 border-t border-blue-900/50">
            <button
              onClick={handleLogout}
              className={`w-full px-4 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${isAdminView ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isAdminView ? 'Back to Admin' : 'Sign Out'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-100 h-24 flex items-center px-8 shrink-0">
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {(isReadOnly || isAdminView) && (
                <button
                  onClick={() => navigate(isAdminView ? '/admin' : '/supervisor')}
                  className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:text-gray-900 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              )}
              <h1 className="text-2xl font-bold text-gray-900">Miner Dashboard</h1>
              {isReadOnly && (
                <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                  Read-Only Monitor
                </div>
              )}
            </div>
            <button
              onClick={() => !isReadOnly && setIsProfileOpen(true)}
              className="flex items-center space-x-3 group"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-gray-900 leading-none">{userProfile?.full_name || 'Miner'}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-1">{userProfile?.role || 'User'}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center font-black text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                {userProfile?.full_name?.charAt(0) || '?'}
              </div>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
          {renderContent()}
        </main>
        <Footer />
      </div>

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={{ ...user, ...userProfile }}
        onUpdate={fetchUserRole}
      />
    </div>
  )
}

export default MinerDashboard
