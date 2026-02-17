import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function Attendance({ userId = null, isReadOnly = false }) {
    const [currentUser, setCurrentUser] = useState(null)
    const [attendance, setAttendance] = useState(null)
    const [loading, setLoading] = useState(true)
    const [checkingIn, setCheckingIn] = useState(false)
    const [checkingOut, setCheckingOut] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [history, setHistory] = useState({})

    const fetchUser = useCallback(async () => {
        try {
            if (userId) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('id, full_name, email')
                    .eq('id', userId)
                    .single()
                if (profile) {
                    setCurrentUser({ id: profile.id, email: profile.email })
                } else {
                    setLoading(false)
                }
            } else {
                const { data: { user: authUser } } = await supabase.auth.getUser()
                if (authUser) {
                    const { data: profile } = await supabase
                        .from('users')
                        .select('id, full_name, email')
                        .eq('id', authUser.id)
                        .single()
                    if (profile) {
                        setCurrentUser({ id: profile.id, email: profile.email })
                    } else {
                        setLoading(false)
                    }
                } else {
                    setLoading(false)
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error)
            setLoading(false)
        }
    }, [userId])

    const fetchTodayAttendance = useCallback(async () => {
        if (!currentUser) {
            setLoading(false)
            return
        }

        try {
            const today = new Date().toISOString().split('T')[0]
            const { data, error } = await supabase
                .from('attendance')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('date', today)
                .single()

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching attendance:', error)
            } else {
                setAttendance(data || null)
            }
        } catch (error) {
            console.error('Error in fetchTodayAttendance:', error)
        } finally {
            setLoading(false)
        }
    }, [currentUser])

    const fetchMonthAttendance = useCallback(async () => {
        if (!currentUser) return

        try {
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0]
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0]

            const { data, error } = await supabase
                .from('attendance')
                .select('*')
                .eq('user_id', currentUser.id)
                .gte('date', startOfMonth)
                .lte('date', endOfMonth)

            if (error) {
                console.error('Error fetching month attendance:', error)
            } else {
                const historyMap = {}
                data?.forEach(record => {
                    historyMap[record.date] = record
                })
                setHistory(historyMap)
            }
        } catch (error) {
            console.error('Error in fetchMonthAttendance:', error)
        }
    }, [currentUser, currentMonth])

    useEffect(() => {
        const initialize = async () => {
            await fetchUser()
        }
        initialize()

        // Update time every second
        const timer = setInterval(() => {
            setCurrentTime(new Date())
        }, 1000)

        return () => clearInterval(timer)
    }, [userId, fetchUser])

    useEffect(() => {
        if (currentUser) {
            fetchTodayAttendance()
            fetchMonthAttendance()
        } else {
            // If no user after a reasonable time, stop loading
            const timeout = setTimeout(() => {
                setLoading(false)
            }, 2000)
            return () => clearTimeout(timeout)
        }
    }, [currentUser, currentMonth, fetchTodayAttendance, fetchMonthAttendance])

    // Subscribe to attendance changes for real-time updates
    useEffect(() => {
        const channel = supabase
            .channel('attendance-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'attendance'
                },
                (payload) => {
                    // Refresh attendance if it's for the current user
                    if (currentUser && payload.new?.user_id === currentUser.id) {
                        fetchTodayAttendance()
                        fetchMonthAttendance()
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentUser, fetchTodayAttendance, fetchMonthAttendance])

    // Calendar generation logic
    const getCalendarDays = () => {
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        const days = []
        for (let i = 0; i < firstDay; i++) {
            days.push(null)
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i))
        }
        return days
    }

    const calendarDays = getCalendarDays()

    const handleCheckIn = async () => {
        if (!currentUser || checkingIn) return

        setCheckingIn(true)
        try {
            const today = new Date().toISOString().split('T')[0]
            const now = new Date()
            const entryTime = now.toTimeString().split(' ')[0] // HH:MM:SS format

            // Check if attendance already exists for today
            const { data: existing, error: checkError } = await supabase
                .from('attendance')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('date', today)
                .maybeSingle()

            if (checkError && checkError.code !== 'PGRST116') {
                console.error('Error checking existing attendance:', checkError)
                throw checkError
            }

            if (existing) {
                // Update existing record
                const { error } = await supabase
                    .from('attendance')
                    .update({
                        entry_time: entryTime,
                        exit_time: null,
                        status: 'present',
                        marked_by: currentUser.id
                    })
                    .eq('id', existing.id)

                if (error) {
                    console.error('Update error:', error)
                    throw error
                }
            } else {
                // Create new attendance record
                const { error } = await supabase
                    .from('attendance')
                    .insert({
                        user_id: currentUser.id,
                        date: today,
                        entry_time: entryTime,
                        exit_time: null,
                        status: 'present',
                        marked_by: currentUser.id
                    })

                if (error) {
                    console.error('Insert error:', error)
                    throw error
                }
            }

            await fetchMonthAttendance()
            await fetchTodayAttendance()
        } catch (error) {
            console.error('Error checking in:', error)
            const errorMessage = error?.message || 'Failed to check in. Please try again.'
            alert(`Failed to check in: ${errorMessage}\n\nIf this persists, you may need to add RLS policies to allow users to insert their own attendance.`)
        } finally {
            setCheckingIn(false)
        }
    }

    const handleCheckOut = async () => {
        if (!currentUser || !attendance || checkingOut) return

        setCheckingOut(true)
        try {
            const now = new Date()
            const exitTime = now.toTimeString().split(' ')[0] // HH:MM:SS format

            // Calculate hours worked
            const entryTime = attendance.entry_time
            if (entryTime) {
                const [entryHours, entryMinutes] = entryTime.split(':').map(Number)
                const [exitHours, exitMinutes] = exitTime.split(':').map(Number)

                const entryMinutesTotal = entryHours * 60 + entryMinutes
                const exitMinutesTotal = exitHours * 60 + exitMinutes
                const minutesWorked = exitMinutesTotal - entryMinutesTotal
                const hoursWorked = (minutesWorked / 60).toFixed(2)

                const { error } = await supabase
                    .from('attendance')
                    .update({
                        exit_time: exitTime,
                        hours_worked: parseFloat(hoursWorked),
                        marked_by: currentUser.id
                    })
                    .eq('id', attendance.id)

                if (error) {
                    console.error('Update error:', error)
                    throw error
                }
            }

            await fetchMonthAttendance()
            await fetchTodayAttendance()
        } catch (error) {
            console.error('Error checking out:', error)
            const errorMessage = error?.message || 'Failed to check out. Please try again.'
            alert(`Failed to check out: ${errorMessage}`)
        } finally {
            setCheckingOut(false)
        }
    }

    const isCheckedIn = attendance && attendance.entry_time && !attendance.exit_time

    const formatTime = (timeString) => {
        if (!timeString) return 'N/A'
        const [hours, minutes] = timeString.split(':')
        return `${hours}:${minutes}`
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600">Loading attendance...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Page Title & Current Time */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Attendance</h2>
                    <p className="text-gray-600 mt-1">Check in and check out for your shift</p>
                </div>

                {/* Compact Current Time Display */}
                <div className="bg-white rounded-xl px-6 py-3 shadow-md border border-gray-50 text-center min-w-[200px]">
                    <p className="text-2xl font-bold text-blue-600">
                        {currentTime.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                        })}
                    </p>
                    <p className="text-xs text-gray-500 font-medium tracking-wide">
                        {currentTime.toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    </p>
                </div>
            </div>

            {/* Check In/Out Section */}
            <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Attendance</h3>

                {attendance ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-gray-500">Entry Time</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {formatTime(attendance.entry_time)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Exit Time</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {attendance.exit_time ? formatTime(attendance.exit_time) : 'Not checked out'}
                                </p>
                            </div>
                        </div>

                        {attendance.hours_worked > 0 && (
                            <div>
                                <p className="text-sm text-gray-500">Hours Worked</p>
                                <p className="text-xl font-semibold text-green-600">
                                    {attendance.hours_worked} hours
                                </p>
                            </div>
                        )}

                        <div>
                            <p className="text-sm text-gray-500">Status</p>
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${isCheckedIn
                                ? 'bg-green-100 text-green-800'
                                : attendance.exit_time
                                    ? 'bg-gray-100 text-gray-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                {isCheckedIn ? 'Active' : attendance.exit_time ? 'Checked Out' : 'Present'}
                            </span>
                        </div>

                        {isCheckedIn ? (
                            <button
                                onClick={handleCheckOut}
                                disabled={checkingOut || isReadOnly}
                                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {checkingOut ? 'Checking Out...' : 'Check Out'}
                            </button>
                        ) : (
                            <button
                                onClick={handleCheckIn}
                                disabled={checkingIn || isReadOnly}
                                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {checkingIn ? 'Checking In...' : 'Check In'}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-gray-600 mb-4">No attendance record for today</p>
                        <button
                            onClick={handleCheckIn}
                            disabled={checkingIn || isReadOnly}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {checkingIn ? 'Checking In...' : 'Check In'}
                        </button>
                    </div>
                )}
            </div>

            {/* Attendance Calendar History */}
            <div className="bg-white rounded-lg p-6 shadow-md">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">Attendance Calendar</h3>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
                            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button
                            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase py-2">
                            {day}
                        </div>
                    ))}

                    {calendarDays.map((date, index) => {
                        if (!date) return <div key={`empty-${index}`} className="h-10"></div>

                        const dateStr = date.toISOString().split('T')[0]
                        const record = history[dateStr]
                        const isToday = dateStr === new Date().toISOString().split('T')[0]
                        const isFuture = date > new Date()
                        const isActive = !!record

                        return (
                            <div key={dateStr} className="relative group flex justify-center py-1">
                                <div
                                    className={`
                                        w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium transition-all duration-200
                                        ${isFuture ? 'text-gray-300' : isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-50 text-red-600 hover:bg-red-100'}
                                        ${isToday ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                                        cursor-default
                                    `}
                                >
                                    {date.getDate()}
                                </div>

                                {/* Tooltip */}
                                {!isFuture && (
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 whitespace-nowrap pointer-events-none">
                                        {isActive ? (
                                            <div className="space-y-1">
                                                <p className="font-bold">{record.hours_worked || 0} Hours Active</p>
                                                <p className="opacity-80 text-[10px]">{formatTime(record.entry_time)} - {record.exit_time ? formatTime(record.exit_time) : 'Present'}</p>
                                            </div>
                                        ) : (
                                            <p className="font-bold">Inactive</p>
                                        )}
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="mt-6 flex items-center justify-center space-x-6 border-t pt-4">
                    <div className="flex items-center text-xs text-gray-600">
                        <div className="w-3 h-3 bg-green-100 border border-green-200 rounded-full mr-2"></div>
                        <span>Active</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-600">
                        <div className="w-3 h-3 bg-red-50 border border-red-100 rounded-full mr-2"></div>
                        <span>Inactive</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-600">
                        <div className="w-3 h-3 border-2 border-blue-500 rounded-full mr-2"></div>
                        <span>Today</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Attendance

