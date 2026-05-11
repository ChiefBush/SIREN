import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, sensorSupabase } from '../lib/supabase'
import MinerLogs from './MinerLogs'
import DashboardCharts from '../components/DashboardCharts'
import SupervisorLeaveManagement from './SupervisorLeaveManagement'
import { useSensorData } from '../hooks/useSensorData'
import Logo from '../components/Logo'
import UserProfileModal from '../components/UserProfileModal'
import ChatFloatingButton from '../components/ChatFloatingButton'
import SupervisorIncidentReports from './SupervisorIncidentReports'
import Footer from '../components/Footer'
import EmergencyAlertModal from '../components/EmergencyAlertModal'
import { usePredictions, getRiskDisplayLabel } from '../hooks/usePredictions'

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
  const [emergencyActive, setEmergencyActive] = useState(false)
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState(false)
  const lastEmergencyIncidentRef = useRef(null) // tracks last incident created to prevent duplicates
  const lastAlertedEmergencyIdRef = useRef(null) // tracks last emergency row ID we showed the modal for
  const lastWarningRowIdRef = useRef(null) // tracks last sensor row checked for warnings to prevent duplicate incidents
  const lastWarningIncidentTimeRef = useRef(0) // tracks last time a warning incident was created (cooldown)
  const lastEmergencyIncidentTimeRef = useRef(0) // tracks last time an emergency incident was created (cooldown)

  // ML Predictions
  const { predictions, latestPrediction } = usePredictions(null, 0.85)
  const criticalPredictions = predictions.filter(p => (p.risk_level === 'high' || p.risk_level === 'critical') && p.risk_score >= 0.85)
  const lastMLPredictionIdRef = useRef(null)

  // Get sensor data for dashboard (charts/metrics — email-gated for the specific miner)
  const { sensorData, sensorHistory, getSensorStatus } = useSensorData(null, user?.email)

  const showNotification = (data) => {
    const notificationId = data.application_id ? `leave-${data.application_id}` : Date.now() + Math.random()

    setNotifications(prev => {
      // Prevent duplicate notifications for the same application
      if (prev.some(n => n.id === notificationId)) {
        return prev
      }

      // Schedule auto-removal outside the updater's return but within the function scope
      // Note: This pattern is slightly better for readability
      setTimeout(() => {
        setNotifications(current => current.filter(n => n.id !== notificationId))
      }, 15000)

      return [{
        id: notificationId,
        type: 'leave-application',
        message: `New leave application from ${data.miner_name} (${data.employee_id})`,
        details: data,
        timestamp: new Date()
      }, ...prev]
    })
  }

  // Sensor thresholds (must match those used in getSensorStatus and the dashboard)
  const SENSOR_THRESHOLDS = {
    mq2: { warning: 300, critical: 500, label: 'MQ-2 (LPG/Smoke)', unit: 'ppm', type: 'hazard' },
    mq9: { warning: 200, critical: 400, label: 'MQ-9 (CO/Flammable Gas)', unit: 'ppm', type: 'hazard' },
    mq135: { warning: 400, critical: 700, label: 'MQ-135 (Air Quality)', unit: 'ppm', type: 'environmental' },
    temperature: { warning: 35, critical: 45, label: 'Temperature (DHT11)', unit: '°C', type: 'hazard' },
    humidity: { warning: 80, critical: 95, label: 'Humidity (DHT11)', unit: '%', type: 'environmental' },
  }

  // Auto-log warning/critical sensor readings as a single consolidated incident
  // COOLDOWN: Only creates one incident per 5 minutes per condition to prevent spam
  const createSensorWarningIncident = async (sensorRow, isEmergency = false) => {
    // Skip if this row is an emergency (covered by emergency incident) or if device is offline
    if (isEmergency) return
    if (!sensorRow?.wristband_connected && sensorRow?.wristband_connected !== undefined) {
      console.log('[SIREN] Skipping warning incident — wristband offline')
      return
    }

    const WARNING_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
    const now = Date.now()

    // Cooldown gate: don't create incidents faster than every 5 minutes
    if (now - lastWarningIncidentTimeRef.current < WARNING_COOLDOWN_MS) {
      console.log('[SIREN] Warning incident cooldown active — skipping')
      return
    }

    try {
      const rowId = String(sensorRow?.id || sensorRow?.created_at || sensorRow?.Timestamp || '')
      if (!rowId || rowId === lastWarningRowIdRef.current) return
      lastWarningRowIdRef.current = rowId

      // Map raw sensor row fields to our named values
      const readings = {
        mq2: parseFloat(sensorRow?.mq2_analog || sensorRow?.mq2) || 0,
        mq9: parseFloat(sensorRow?.mq9_analog || sensorRow?.mq9) || 0,
        mq135: parseFloat(sensorRow?.mq135_analog || sensorRow?.mq135) || 0,
        temperature: parseFloat(sensorRow?.temperature || sensorRow?.dht11_temp) || 0,
        humidity: parseFloat(sensorRow?.humidity || sensorRow?.dht11_humidity) || 0,
      }

      // Collect all sensors that breach a threshold
      const breaches = []
      for (const [key, thresholds] of Object.entries(SENSOR_THRESHOLDS)) {
        const value = readings[key]
        if (value === 0) continue
        if (value >= thresholds.critical) {
          breaches.push({ ...thresholds, key, value, level: 'critical' })
        } else if (value >= thresholds.warning) {
          breaches.push({ ...thresholds, key, value, level: 'warning' })
        }
      }

      // Nothing to log — all sensors safe
      if (breaches.length === 0) return

      // Check if there's already an active incident for the same sensor conditions
      const today = new Date().toISOString().split('T')[0]
      const { data: existingIncidents, error: checkError } = await supabase
        .from('incidents')
        .select('id')
        .eq('status', 'reported')
        .gte('reported_at', new Date(now - WARNING_COOLDOWN_MS).toISOString())
        .limit(1)

      if (checkError) {
        console.error('[SIREN] Error checking existing incidents:', checkError)
      } else if (existingIncidents && existingIncidents.length > 0) {
        console.log('[SIREN] Active incident already exists within cooldown — skipping')
        return
      }

      const { data: { user: authUser } } = await supabase.auth.getUser()
      const reportedBy = authUser?.id || null

      const hasCritical = breaches.some(b => b.level === 'critical')
      const overallSeverity = hasCritical ? 'critical' : 'medium'
      const recordedAt = new Date().toLocaleString()

      // Build one consolidated description listing every breaching sensor
      const breachLines = breaches
        .map(b => `  • ${b.label}: ${b.value.toFixed(1)} ${b.unit} (${b.level === 'critical' ? 'critical' : 'warning'} threshold: ${b.level === 'critical' ? b.critical : b.warning} ${b.unit})`)
        .join('\n')

      const description =
        `⚠️ AUTO-LOGGED SENSOR ${hasCritical ? 'CRITICAL' : 'WARNING'} — ${breaches.length} sensor${breaches.length > 1 ? 's' : ''} exceeded safe limits at ${recordedAt}:\n${breachLines}\n\nImmediate inspection recommended.`

      const { error } = await supabase.from('incidents').insert({
        incident_type: hasCritical ? 'hazard' : 'environmental',
        severity: overallSeverity,
        status: 'reported',
        location: 'Helmet Sensor Node',
        description,
        date: today,
        reported_by: reportedBy
      })

      if (error) {
        console.error('[SIREN] Failed to log sensor warning incident:', error)
      } else {
        lastWarningIncidentTimeRef.current = now
        console.log(`[SIREN] Consolidated sensor warning incident logged (${breaches.length} breach${breaches.length > 1 ? 'es' : ''})`)
      }
    } catch (err) {
      console.error('[SIREN] Error in createSensorWarningIncident:', err)
    }
  }


  // Auto-create a critical incident in the incidents table when an emergency is detected
  // COOLDOWN: Only creates one emergency incident per 5 minutes
  const createEmergencyIncident = async (sensorRow) => {
    const EMERGENCY_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
    const now = Date.now()

    // Skip if device is offline (emergency button can't be pressed if disconnected)
    if (!sensorRow?.wristband_connected && sensorRow?.wristband_connected !== undefined) {
      console.log('[SIREN] Skipping emergency incident — wristband offline')
      return
    }

    // Cooldown gate
    if (now - lastEmergencyIncidentTimeRef.current < EMERGENCY_COOLDOWN_MS) {
      console.log('[SIREN] Emergency incident cooldown active — skipping')
      return
    }

    try {
      // Use the row's id or timestamp as deduplication key
      const dedupeKey = String(sensorRow?.id || sensorRow?.created_at || sensorRow?.Timestamp || Date.now())
      if (lastEmergencyIncidentRef.current === dedupeKey) return
      lastEmergencyIncidentRef.current = dedupeKey

      // Check if there's already an active emergency incident within cooldown
      const { data: existingIncidents, error: checkError } = await supabase
        .from('incidents')
        .select('id')
        .eq('status', 'reported')
        .gte('reported_at', new Date(now - EMERGENCY_COOLDOWN_MS).toISOString())
        .limit(1)

      if (checkError) {
        console.error('[SIREN] Error checking existing emergency incidents:', checkError)
      } else if (existingIncidents && existingIncidents.length > 0) {
        console.log('[SIREN] Active emergency incident already exists within cooldown — skipping')
        return
      }

      const { data: { user: authUser } } = await supabase.auth.getUser()
      const reportedBy = authUser?.id || null

      // Use 'other' if sos_emergency is not a valid enum in your DB, or change as appropriate
      const { error } = await supabase.from('incidents').insert({
        incident_type: 'other',
        severity: 'critical',
        status: 'reported',
        location: 'Helmet Sensor Node',
        description: '🚨 AUTOMATIC EMERGENCY ALERT: Helmet SOS button triggered or fall detected. Emergency signal received from sensor data at ' + new Date().toLocaleString() + '. Immediate response required.',
        date: new Date().toISOString().split('T')[0],
        reported_by: reportedBy
      })

      if (error) {
        console.error('[SIREN] Failed to auto-create emergency incident:', error)
      } else {
        lastEmergencyIncidentTimeRef.current = now
        console.log('[SIREN] Emergency incident created successfully')
      }
    } catch (err) {
      console.error('[SIREN] Error in createEmergencyIncident:', err)
    }
  }

  // Show a red SOS toast notification in the dashboard
  const showEmergencyNotification = () => {
    const notificationId = `emergency-${Date.now()}`
    setNotifications(prev => {
      // Don't stack more than one emergency notification at a time
      if (prev.some(n => n.type === 'emergency')) return prev

      setTimeout(() => {
        setNotifications(current => current.filter(n => n.id !== notificationId))
      }, 30000)

      return [{
        id: notificationId,
        type: 'emergency',
        message: '🚨 Emergency SOS triggered — helmet button pressed or fall detected!',
        timestamp: new Date()
      }, ...prev]
    })
  }

  const showMLNotification = (prediction) => {
    const notificationId = `ml-${prediction.id}`
    setNotifications(prev => {
      if (prev.some(n => n.id === notificationId)) return prev

      setTimeout(() => {
        setNotifications(current => current.filter(n => n.id !== notificationId))
      }, 15000)

      return [{
        id: notificationId,
        type: 'ml-warning',
        message: `🤖 AI Predictive Signal: ${prediction.prediction_type.replace(/_/g, ' ')} detected. Assessment: ${getRiskDisplayLabel(prediction.risk_level)}`,
        timestamp: new Date()
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

  const handleNewLeaveApplication = async (application) => {
    try {
      // Fetch miner details
      const { data: minerData } = await supabase
        .from('users')
        .select('full_name, employee_id')
        .eq('id', application.user_id)
        .single()

      showNotification({
        application_id: application.id,
        miner_name: minerData?.full_name || 'Unknown',
        employee_id: minerData?.employee_id || 'N/A',
        start_date: application.start_date,
        end_date: application.end_date
      })
    } catch (error) {
      console.error('Error handling new leave application:', error)
      showNotification({
        application_id: application.id || 'unknown',
        miner_name: 'Unknown Miner',
        employee_id: 'N/A',
        start_date: application.start_date || 'N/A',
        end_date: application.end_date || 'N/A'
      })
    }
  }

  const fetchPendingLeave = async () => {
    try {
      const { data, error } = await supabase
        .from('leave_applications')
        .select('*')
        .eq('status', 'pending')

      if (error) {
        console.error('Error fetching pending leave:', error)
        return
      }

      if (data && data.length > 0) {
        // Use a slight delay between multiple notifications for better visual clarity
        data.forEach((application, index) => {
          setTimeout(() => {
            handleNewLeaveApplication(application)
          }, index * 200)
        })
      }
    } catch (error) {
      console.error('Error in fetchPendingLeave:', error)
    }
  }

  useEffect(() => {
    // Initial load
    fetchUser()
    fetchMiners()
    fetchActiveStatuses()

    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    const statusInterval = setInterval(() => fetchActiveStatuses(), 30000)

    const attendanceChannel = supabase.channel('attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, fetchActiveStatuses)
      .subscribe()

    const leaveChannel = supabase.channel('supervisor-leave-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leave_applications' }, (payload) => {
        handleNewLeaveApplication(payload.new)
      })
      .subscribe()

    const notificationChannel = supabase.channel('supervisor-broadcast')
      .on('broadcast', { event: 'new-leave-application' }, (payload) => {
        showNotification(payload.payload)
      })
      .subscribe()

    // --- Emergency polling (runs every 15s, more reliable than realtime alone) ---
    // Fetches the single most recent sensor_data row and checks if emergency is truthy.
    const pollEmergency = async () => {
      try {
        const { data, error } = await sensorSupabase
          .from('sensor_data')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (error) {
          // Fallback: try ordering by 'Timestamp' in case created_at doesn't exist
          const { data: data2, error: error2 } = await sensorSupabase
            .from('sensor_data')
            .select('*')
            .order('Timestamp', { ascending: false })
            .limit(1)
            .single()

          if (error2) {
            console.error('[SIREN] Emergency poll failed (both orderings):', error, error2)
            return
          }

          console.log('[SIREN] Emergency poll row (Timestamp order):', data2)
          const isEmergency = data2?.emergency === true || data2?.emergency === 'true' || data2?.emergency === 1
          // Pass isEmergency so warning log is skipped if this row is an emergency
          createSensorWarningIncident(data2, isEmergency)
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

        console.log('[SIREN] Emergency poll row:', data)
        const isEmergency = data?.emergency === true || data?.emergency === 'true' || data?.emergency === 1
        // Pass isEmergency so warning log is skipped if this row is an emergency
        createSensorWarningIncident(data, isEmergency)
        if (isEmergency) {
          // Only alert if this is a NEW emergency row (different id from the last one we showed)
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
        console.error('[SIREN] Emergency poll exception:', e)
      }
    }

    // Run immediately on mount, then every 15 seconds
    pollEmergency()
    const emergencyPollInterval = setInterval(pollEmergency, 15000)

    // Also keep realtime as a bonus (fires immediately if Supabase Realtime is enabled)
    const emergencyChannel = sensorSupabase
      .channel('supervisor-emergency-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sensor_data'
      }, (payload) => {
        console.log('[SIREN] Realtime emergency event received:', payload.new)
        const isEmergencyRow = payload.new?.emergency === true || payload.new?.emergency === 'true' || payload.new?.emergency === 1
        // Pass isEmergencyRow so warning log is skipped if this row is an emergency
        createSensorWarningIncident(payload.new, isEmergencyRow)
        if (isEmergencyRow) {
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
        console.log('[SIREN] Emergency channel status:', status)
      })

    fetchPendingLeave()

    return () => {
      clearInterval(timer)
      clearInterval(statusInterval)
      clearInterval(emergencyPollInterval)
      supabase.removeChannel(attendanceChannel)
      supabase.removeChannel(leaveChannel)
      supabase.removeChannel(notificationChannel)
      sensorSupabase.removeChannel(emergencyChannel)
    }
  }, [userId])

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const fetchUser = async () => {
    try {
      if (userId) {
        // Fetch specific user profile if userId is provided
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

  // Fetch active incidents for dashboard status
  const [activeIncidents, setActiveIncidents] = useState([])
  useEffect(() => {
    fetchActiveIncidents()
    // Subscribe to incident changes
    const incidentChannel = supabase
      .channel('dashboard-incidents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => fetchActiveIncidents()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(incidentChannel)
    }
  }, [])

  const fetchActiveIncidents = async () => {
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .neq('status', 'resolved')
        .neq('status', 'closed')

      if (!error && data) {
        setActiveIncidents(data)
      }
    } catch (err) {
      console.error('Error fetching active incidents:', err)
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

  const sensorSafeCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'safe').length
  const sensorWarningCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'warning').length
  const sensorCriticalCount = [mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'critical').length

  // Incident counts
  const criticalIncidentsCount = activeIncidents.filter(i => i.severity === 'critical' || i.severity === 'high').length
  const warningIncidentsCount = activeIncidents.filter(i => i.severity === 'medium' || i.severity === 'low').length

  // Total counts for dashboard — status cards now show ONLY live sensor status
  const warningCount = sensorWarningCount
  const criticalCount = sensorCriticalCount
  const safeCount = sensorSafeCount

  const allSystemsNormal = warningCount === 0 && criticalCount === 0 && warningIncidentsCount === 0 && criticalIncidentsCount === 0

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
    { id: 'dashboard', label: 'Dashboard', icon: null },
    { id: 'incidents', label: 'Incident Reports', icon: null },
    { id: 'leave', label: 'Leave Management', icon: null },
    { id: 'miner-logs', label: 'Miner Logs', icon: null },
    { id: 'prediction-history', label: 'ML Analytics', icon: null }
  ]

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
              <p className="text-xs text-blue-300">Supervisor Portal</p>
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
            className={`w-full px-4 py-2 ${isAdminView ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-600 hover:bg-red-700'} text-white rounded-lg transition-colors font-medium`}
          >
            {isAdminView ? 'Back to Admin' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 h-24 flex items-center">
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">Supervisor Dashboard</h1>
            </div>
            <div className="text-gray-600 flex items-center space-x-4">
              {isAdminView && <span className="mr-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">Admin View</span>}
              <button
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-blue-600 uppercase">
                    {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </div>
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
                onClick={() => {
                  if (notification.type === 'emergency') {
                    setActivePage('incidents')
                  } else if (notification.type === 'ml-warning') {
                    setActivePage('prediction-history')
                  } else {
                    setActivePage('leave')
                  }
                  removeNotification(notification.id)
                }}
                className={`text-white rounded-lg shadow-lg p-4 flex items-start space-x-3 transform transition-all duration-300 ease-in-out cursor-pointer ${
                  notification.type === 'emergency'
                    ? 'bg-red-600 hover:bg-red-700 animate-pulse border-2 border-red-400'
                  : notification.type === 'ml-warning'
                    ? 'bg-orange-600 hover:bg-orange-700 animate-pulse border-2 border-orange-400'
                  : 'bg-blue-600 hover:bg-blue-700'
                  }`}
              >
                <div className="flex-shrink-0">
                  {notification.type === 'emergency' ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : notification.type === 'ml-warning' ? (
                    <span className="text-xl">🤖</span>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">
                    {notification.type === 'emergency' ? '🚨 Emergency SOS Alert' : notification.type === 'ml-warning' ? '🤖 AI Early Warning' : 'New Leave Application'}
                  </p>
                  <p className="text-sm opacity-90">{notification.message}</p>
                  {notification.details && notification.type !== 'ml-warning' && (
                    <p className="text-xs opacity-75 mt-1">
                      {new Date(notification.details.start_date).toLocaleDateString()} - {new Date(notification.details.end_date).toLocaleDateString()}
                    </p>
                  )}
                  {notification.type === 'emergency' && (
                    <p className="text-xs opacity-75 mt-1 font-bold">Click to view Incident Reports →</p>
                  )}
                  {notification.type === 'ml-warning' && (
                    <p className="text-xs opacity-75 mt-1 font-bold">Click to view ML Analytics →</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeNotification(notification.id)
                  }}
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
              {/* Global Emergency Alert Banner — stays visible after popup dismissed */}
              {emergencyActive && (
                <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between animate-pulse">
                  <div className="flex items-center space-x-3">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h3 className="text-xl font-bold">EMERGENCY ALERT</h3>
                      <p className="text-sm opacity-90">Hardware emergency button pressed or fall detected on helmet node!</p>
                    </div>
                  </div>
                  <div className="text-sm font-mono bg-white bg-opacity-20 px-3 py-1 rounded">
                    ACTIVE
                  </div>
                </div>
              )}

              {/* Page Title & System Status */}
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

              {/* Early Warnings Widget */}
              {(criticalPredictions.length > 0) && (
                <div className="bg-white rounded-lg shadow-md border border-orange-200 overflow-hidden mb-6">
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

              {/* Summary Information Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Active Sensor Alerts */}
                <div className="bg-white rounded-lg p-6 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Sensor Alerts</h3>
                    <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-4xl font-bold text-gray-900 mb-2">
                    {sensorWarningCount + sensorCriticalCount}
                  </div>
                  <p className="text-sm text-gray-600">Active sensor warnings</p>
                </div>

                {/* Active Incidents */}
                <div className="bg-white rounded-lg p-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActivePage('incidents')}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Active Incidents</h3>
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="text-4xl font-bold text-gray-900 mb-2">
                    {activeIncidents.length}
                  </div>
                  <p className="text-sm text-gray-600">Reported issues</p>
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


              {/* Summary Status Cards */}
              <div className="grid grid-cols-3 gap-4">
                {!sensorData.wristbandConnected ? (
                  <div className="col-span-3 bg-gray-400 rounded-lg p-6 text-white shadow-md">
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
                    <div className={`rounded-lg p-6 text-white shadow-md ${safeCount > 0 ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-4xl font-bold">{safeCount}</div>
                          <div className="text-sm font-medium mt-1 opacity-90">Sensors Normal</div>
                          <div className="text-[10px] opacity-75 mt-1 uppercase tracking-wider">out of 5 sensors</div>
                        </div>
                        <svg className="w-8 h-8 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div className={`rounded-lg p-6 text-white shadow-md ${warningCount > 0 ? 'bg-yellow-500' : 'bg-gray-300'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-4xl font-bold">{warningCount}</div>
                          <div className="text-sm font-medium mt-1 opacity-90">Sensor Warnings</div>
                          <div className="text-[10px] opacity-75 mt-1 uppercase tracking-wider">live thresholds exceeded</div>
                        </div>
                        <svg className="w-8 h-8 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div className={`rounded-lg p-6 text-white shadow-md ${criticalCount > 0 ? 'bg-red-500' : 'bg-gray-300'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-4xl font-bold">{criticalCount}</div>
                          <div className="text-sm font-medium mt-1 opacity-90">Sensor Critical</div>
                          <div className="text-[10px] opacity-75 mt-1 uppercase tracking-wider">live critical thresholds</div>
                        </div>
                        <svg className="w-8 h-8 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Dashboard Charts Section */}
              <DashboardCharts userId={null} userEmail={user?.email} />

            </div>
          )}

          {/* Incident Reports Page */}
          {activePage === 'incidents' && (
            <SupervisorIncidentReports userId={userId} userEmail={user?.email} isSupervisor={true} />
          )}

          {/* Leave Management Page */}
          {activePage === 'leave' && (
            <SupervisorLeaveManagement />
          )}

          {/* Miner Logs Page */}
          {activePage === 'miner-logs' && (
            <MinerLogs user={user} />
          )}

          {activePage === 'prediction-history' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">AI Predictive Risk History</h2>
                <p className="text-gray-600 mt-1">Historical log of AI-assessed risk conditions relevant to your team — advisory only.</p>
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
                            No AI risk predictions recorded yet for your team.
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
        </main>
        <Footer />
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
              .then(({ data }) => {
                if (data) {
                  setUserProfile(data)
                  fetchMiners() // Also refresh the list in case name changed
                }
              })
          }
        }}
      />

      {/* Chat Functionality */}
      {user && <ChatFloatingButton currentUser={user} />}

      {/* Emergency SOS Popup Alert */}
      <EmergencyAlertModal
        isOpen={emergencyActive && !emergencyAcknowledged}
        onDismiss={() => setEmergencyAcknowledged(true)}
      />
    </div>
  )
}

export default SupervisorDashboard
