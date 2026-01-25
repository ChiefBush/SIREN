import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function SupervisorLeaveManagement() {
    const [allApplications, setAllApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all') // all, pending, accepted, rejected

    useEffect(() => {
        fetchAllLeaveApplications()

        // Subscribe to real-time changes
        const channel = supabase
            .channel('supervisor-leave-applications-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'leave_applications'
                },
                (payload) => {
                    console.log('Leave application change detected:', payload)
                    fetchAllLeaveApplications()
                }
            )
            .subscribe((status) => {
                console.log('Supervisor leave applications channel subscription status:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const fetchAllLeaveApplications = async () => {
        setLoading(true)
        try {
            // Supervisor sees all applications from all miners
            const { data, error } = await supabase
                .from('leave_applications')
                .select(`
          *,
          users(full_name, email, employee_id)
        `)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error fetching leave applications:', error)
            } else {
                setAllApplications(data || [])
            }
        } catch (error) {
            console.error('Error in fetchAllLeaveApplications:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleStatusUpdate = async (applicationId, newStatus) => {
        try {
            const { error } = await supabase
                .from('leave_applications')
                .update({ status: newStatus })
                .eq('id', applicationId)

            if (error) {
                console.error('Error updating leave application status:', error)
                alert('Failed to update status. Please try again.')
            } else {
                // Refresh applications after update
                fetchAllLeaveApplications()
            }
        } catch (error) {
            console.error('Error in handleStatusUpdate:', error)
            alert('An error occurred. Please try again.')
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

    // Filter applications based on selected filter
    const filteredApplications = allApplications.filter((app) => {
        if (filter === 'all') return true
        return app.status === filter
    })

    // Calculate statistics
    const stats = {
        total: allApplications.length,
        pending: allApplications.filter((app) => app.status === 'pending').length,
        accepted: allApplications.filter((app) => app.status === 'accepted').length,
        rejected: allApplications.filter((app) => app.status === 'rejected').length
    }

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div>
                <h2 className="text-3xl font-bold text-gray-900">Leave Management</h2>
                <p className="text-gray-600 mt-1">
                    Review and manage leave applications from all miners
                </p>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total Applications</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                        </div>
                        <div className="p-3 bg-blue-100 rounded-full">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Pending</p>
                            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                        </div>
                        <div className="p-3 bg-yellow-100 rounded-full">
                            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Accepted</p>
                            <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
                        </div>
                        <div className="p-3 bg-green-100 rounded-full">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Rejected</p>
                            <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                        </div>
                        <div className="p-3 bg-red-100 rounded-full">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Leave Applications List */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                        <h3 className="text-xl font-bold text-gray-900">
                            All Leave Applications
                        </h3>
                        <div className="flex items-center space-x-4">
                            {/* Filter Buttons */}
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setFilter('all')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'all'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setFilter('pending')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'pending'
                                            ? 'bg-yellow-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    Pending
                                </button>
                                <button
                                    onClick={() => setFilter('accepted')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'accepted'
                                            ? 'bg-green-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    Accepted
                                </button>
                                <button
                                    onClick={() => setFilter('rejected')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'rejected'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    Rejected
                                </button>
                            </div>
                            {/* Refresh Button */}
                            <button
                                onClick={fetchAllLeaveApplications}
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-600">Loading applications...</div>
                    </div>
                ) : filteredApplications.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-600 text-lg">
                            {filter === 'all'
                                ? 'No leave applications found'
                                : `No ${filter} leave applications found`}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Miner
                                    </th>
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredApplications.map((application) => {
                                    const start = new Date(application.start_date)
                                    const end = new Date(application.end_date)
                                    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

                                    return (
                                        <tr key={application.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {application.users?.full_name || 'N/A'}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {application.users?.employee_id || 'N/A'}
                                                </div>
                                            </td>
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
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {application.status === 'pending' ? (
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={() => handleStatusUpdate(application.id, 'accepted')}
                                                            className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(application.id, 'rejected')}
                                                            className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400">-</span>
                                                )}
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

export default SupervisorLeaveManagement
