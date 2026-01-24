import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Attendance({ userId = null }) {
    const [currentUser, setCurrentUser] = useState(null)
    const [attendance, setAttendance] = useState(null)
    const [loading, setLoading] = useState(true)
    const [checkingIn, setCheckingIn] = useState(false)
    const [checkingOut, setCheckingOut] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())

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
    }, [userId])

    // Fetch attendance once user is loaded
    useEffect(() => {
        if (currentUser) {
            fetchTodayAttendance()
        } else {
            // If no user after a reasonable time, stop loading
            const timeout = setTimeout(() => {
                setLoading(false)
            }, 2000)
            return () => clearTimeout(timeout)
        }
    }, [currentUser])

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
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentUser])

    const fetchUser = async () => {
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
    }

    const fetchTodayAttendance = async () => {
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
    }

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
            {/* Page Title */}
            <div>
                <h2 className="text-3xl font-bold text-gray-900">Attendance</h2>
                <p className="text-gray-600 mt-1">Check in and check out for your shift</p>
            </div>

            {/* Current Time Display */}
            <div className="bg-white rounded-lg p-6 shadow-md">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Current Time</h3>
                        <p className="text-3xl font-bold text-blue-600 mt-2">
                            {currentTime.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                            })}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                            {currentTime.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
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
                                disabled={checkingOut}
                                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {checkingOut ? 'Checking Out...' : 'Check Out'}
                            </button>
                        ) : (
                            <button
                                onClick={handleCheckIn}
                                disabled={checkingIn}
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
                            disabled={checkingIn}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {checkingIn ? 'Checking In...' : 'Check In'}
                        </button>
                    </div>
                )}
            </div>

            {/* Recent Attendance History */}
            <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Attendance</h3>
                <div className="text-sm text-gray-500">
                    Attendance history will be displayed here
                </div>
            </div>
        </div>
    )
}

export default Attendance

