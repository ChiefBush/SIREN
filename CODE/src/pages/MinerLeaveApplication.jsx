import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function MinerLeaveApplication({ userId = null }) {
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const [leaveType, setLeaveType] = useState('sick')
    const [leaveApplications, setLeaveApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [showSuccessMessage, setShowSuccessMessage] = useState(false)

    useEffect(() => {
        fetchLeaveApplications()

        // Subscribe to real-time changes
        const channel = supabase
            .channel('miner-leave-applications-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'leave_applications'
                },
                (payload) => {
                    console.log('Leave application change detected:', payload)
                    fetchLeaveApplications()
                }
            )
            .subscribe((status) => {
                console.log('Leave applications channel subscription status:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId])

    const fetchLeaveApplications = async () => {
        setLoading(true)
        try {
            const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id
            if (!targetUserId) {
                setLoading(false)
                return
            }

            // Miner sees only their own applications
            const { data, error } = await supabase
                .from('leave_applications')
                .select('*')
                .eq('user_id', targetUserId)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error fetching leave applications:', error)
            } else {
                setLeaveApplications(data || [])
            }
        } catch (error) {
            console.error('Error in fetchLeaveApplications:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!startDate || !endDate) {
            alert('Please select both start and end dates')
            return
        }

        if (new Date(startDate) > new Date(endDate)) {
            alert('Start date cannot be after end date')
            return
        }

        if (new Date(startDate) < new Date().toISOString().split('T')[0]) {
            alert('Start date cannot be in the past')
            return
        }

        setSubmitting(true)
        try {
            const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id
            if (!targetUserId) {
                alert('User not found. Please log in again.')
                return
            }

            const { data, error } = await supabase
                .from('leave_applications')
                .insert([
                    {
                        user_id: targetUserId,
                        start_date: startDate,
                        end_date: endDate,
                        leave_type: leaveType,
                        reason: reason || null,
                        status: 'pending'
                    }
                ])
                .select()

            if (error) {
                console.error('Error submitting leave application:', error)
                alert(`Failed to submit: ${error.message || 'Unknown error'}`)
            } else if (!data || data.length === 0) {
                console.error('No data returned after insert')
                alert('Success, but could not verify submission. Please refresh the list.')
                fetchLeaveApplications()
            } else {
                // Show success message
                setShowSuccessMessage(true)
                setTimeout(() => setShowSuccessMessage(false), 5000)

                // Reset form
                setStartDate('')
                setEndDate('')
                setReason('')
                setLeaveType('sick')

                // Refresh applications
                fetchLeaveApplications()

                // Notify supervisor via real-time
                notifySupervisor(data[0])
            }
        } catch (error) {
            console.error('Error in handleSubmit:', error)
            alert('An error occurred. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    const notifySupervisor = async (application) => {
        try {
            console.log('Notifying supervisor about new application:', application)
            // Get miner info
            const { data: minerData } = await supabase
                .from('users')
                .select('full_name, employee_id')
                .eq('id', application.user_id)
                .single()

            // Send broadcast notification to supervisors
            const channel = supabase.channel('supervisor-broadcast', {
                config: {
                    broadcast: { self: true }
                }
            })

            const subscription = channel
                .on('broadcast', { event: 'new-leave-application' }, () => {
                    console.log('Broadcast received confirmation')
                })
                .subscribe(async (status) => {
                    console.log('Broadcast channel subscription status:', status)
                    if (status === 'SUBSCRIBED') {
                        const result = await channel.send({
                            type: 'broadcast',
                            event: 'new-leave-application',
                            payload: {
                                application_id: application.id,
                                miner_name: minerData?.full_name || 'Unknown',
                                employee_id: minerData?.employee_id || 'N/A',
                                start_date: application.start_date,
                                end_date: application.end_date
                            }
                        })
                        console.log('Broadcast message sent, result:', result)
                    } else {
                        console.warn('Channel not subscribed, status:', status)
                    }
                })
        } catch (error) {
            console.error('Error notifying supervisor:', error)
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'accepted':
                return 'bg-green-100 text-green-800'
            case 'rejected':
                return 'bg-red-100 text-red-800'
            case 'pending':
                return 'bg-yellow-100 text-yellow-800'
            default:
                return 'bg-gray-100 text-gray-800'
        }
    }

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A'
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div>
                <h2 className="text-3xl font-bold text-gray-900">Leave Application</h2>
                <p className="text-gray-600 mt-1">
                    Apply for leave and manage your time off
                </p>
            </div>

            {/* Success Message */}
            {showSuccessMessage && (
                <div className="fixed top-4 right-4 bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-lg shadow-lg z-50">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Leave application submitted successfully! Supervisor has been notified.</span>
                    </div>
                </div>
            )}

            {/* Leave Application Form */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Apply for Leave</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="leaveType" className="block text-sm font-medium text-gray-700 mb-2">
                                Leave Type <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="leaveType"
                                value={leaveType}
                                onChange={(e) => setLeaveType(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            >
                                <option value="sick">Sick Leave</option>
                                <option value="casual">Casual Leave</option>
                                <option value="annual">Annual Leave</option>
                                <option value="emergency">Emergency Leave</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                                Start Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                id="startDate"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                                End Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                id="endDate"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate || new Date().toISOString().split('T')[0]}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                            Reason (Optional)
                        </label>
                        <textarea
                            id="reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows="3"
                            placeholder="Provide a reason for your leave request..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Submitting...' : 'Submit Application'}
                        </button>
                    </div>
                </form>
            </div>

            {/* My Leave Applications List */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-900">
                        My Leave Applications
                    </h3>
                    <button
                        onClick={fetchLeaveApplications}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Refresh</span>
                    </button>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-600">Loading applications...</div>
                    </div>
                ) : leaveApplications.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-600 text-lg">No leave applications found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Leave Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Start Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        End Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Days
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Applied On
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {leaveApplications.map((application) => {
                                    const start = new Date(application.start_date)
                                    const end = new Date(application.end_date)
                                    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

                                    return (
                                        <tr key={application.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900 capitalize">
                                                    {application.leave_type || 'N/A'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{formatDate(application.start_date)}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{formatDate(application.end_date)}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{days} day{days !== 1 ? 's' : ''}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(application.status)}`}>
                                                    {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-500">
                                                    {new Date(application.created_at).toLocaleDateString('en-US', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default MinerLeaveApplication
