import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function SupervisorLeaveManagement() {
    const [allApplications, setAllApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all') // all, pending, accepted, rejected
    const [confirmDialog, setConfirmDialog] = useState({ show: false, applicationId: null, action: null, minerName: null })
    const [showSuccessMessage, setShowSuccessMessage] = useState(false)
    const [currentUser, setCurrentUser] = useState(null)
    const [currentUserProfile, setCurrentUserProfile] = useState(null)

    // Tooltip state
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, reason: '' })
    const tooltipTimeout = useRef(null)

    // Detail modal state
    const [selectedApplication, setSelectedApplication] = useState(null)

    useEffect(() => {
        fetchAllLeaveApplications()
        fetchCurrentUser()

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
            if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
        }
    }, [])

    const fetchCurrentUser = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUser(user)
                const { data: profile } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single()
                if (profile) {
                    setCurrentUserProfile(profile)
                }
            }
        } catch (error) {
            console.error('Error fetching current user:', error)
        }
    }

    const logActivity = async (application, action) => {
        try {
            const starts = new Date(application.start_date)
            const ends = new Date(application.end_date)
            const days = Math.ceil((ends - starts) / (1000 * 60 * 60 * 24)) + 1
            const actionLabel = action === 'accepted' ? 'ACCEPT_LEAVE' : 'REJECT_LEAVE'

            await supabase
                .from('admin_activity_logs')
                .insert({
                    admin_id: currentUser?.id,
                    admin_name: currentUserProfile?.full_name || currentUser?.email || 'Supervisor',
                    target_user_id: application.user_id,
                    target_user_name: application.users?.full_name || 'Miner',
                    action: actionLabel,
                    details: `${action === 'accepted' ? 'Accepted' : 'Rejected'} ${application.leave_type} leave from ${formatDate(application.start_date)} to ${formatDate(application.end_date)} (${days} days)`
                })
        } catch (error) {
            console.error('Error logging activity:', error)
        }
    }

    const fetchAllLeaveApplications = async () => {
        setLoading(true)
        try {
            console.log('fetching all leave applications...')
            const { data, error } = await supabase
                .from('leave_applications')
                .select(`
                    *,
                    users!user_id (
                        full_name,
                        email,
                        employee_id
                    )
                `)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error fetching leave applications:', error)

                if (error.message?.includes('users')) {
                    console.log('Attempting fallback fetch without users join...')
                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('leave_applications')
                        .select('*')
                        .order('created_at', { ascending: false })

                    if (fallbackError) {
                        alert(`Failed to fetch: ${fallbackError.message}`)
                    } else {
                        setAllApplications(fallbackData || [])
                    }
                } else {
                    alert(`Failed to fetch: ${error.message}`)
                }
            } else {
                console.log(`Successfully fetched ${data?.length || 0} leave applications`)
                setAllApplications(data || [])
            }
        } catch (error) {
            console.error('Error in fetchAllLeaveApplications:', error)
            alert('An unexpected error occurred while fetching applications.')
        } finally {
            setLoading(false)
        }
    }

    const showConfirmation = (applicationId, action, minerName) => {
        setConfirmDialog({ show: true, applicationId, action, minerName })
    }

    const handleConfirmAction = async () => {
        const { applicationId, action } = confirmDialog
        setConfirmDialog({ show: false, applicationId: null, action: null, minerName: null })

        try {
            const { error } = await supabase
                .from('leave_applications')
                .update({ status: action, updated_at: new Date().toISOString() })
                .eq('id', applicationId)

            if (error) {
                console.error('Error updating leave application status:', error)
                alert('Failed to update status. Please try again.')
            } else {
                setShowSuccessMessage(true)
                setTimeout(() => setShowSuccessMessage(false), 3000)

                // Log the activity
                const application = allApplications.find(app => app.id === applicationId)
                if (application) {
                    logActivity(application, action)
                }

                fetchAllLeaveApplications()
            }
        } catch (error) {
            console.error('Error in handleConfirmAction:', error)
            alert('An error occurred. Please try again.')
        }
    }

    const handleCancelAction = () => {
        setConfirmDialog({ show: false, applicationId: null, action: null, minerName: null })
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

    const getStatusDotColor = (status) => {
        switch (status) {
            case 'accepted': return '#16a34a'
            case 'rejected': return '#dc2626'
            case 'pending': return '#d97706'
            default: return '#6b7280'
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

    // Tooltip handlers
    const handleRowMouseEnter = (e, reason) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
        const rect = e.currentTarget.getBoundingClientRect()
        const targetX = rect.left + rect.width / 2
        const targetY = rect.top - 10
        tooltipTimeout.current = setTimeout(() => {
            setTooltip({
                visible: true,
                x: targetX,
                y: targetY,
                reason: reason || 'No reason provided'
            })
        }, 200)
    }

    const handleRowMouseMove = (e) => {
        if (!tooltip.visible) return
        setTooltip(prev => ({
            ...prev,
            x: e.clientX,
            y: e.clientY - 10
        }))
    }

    const handleRowMouseLeave = () => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
        setTooltip(prev => ({ ...prev, visible: false }))
    }

    // Row click handler — open detail modal
    const handleRowClick = (e, application) => {
        // Don't open modal if clicking action buttons
        if (e.target.closest('button')) return
        setSelectedApplication(application)
    }

    const closeDetailModal = () => setSelectedApplication(null)

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
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">
                                All Leave Applications
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">Hover a row to preview reason · Click a row for full details</p>
                        </div>
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
                                    const isSelected = selectedApplication?.id === application.id

                                    return (
                                        <tr
                                            key={application.id}
                                            onClick={(e) => handleRowClick(e, application)}
                                            onMouseEnter={(e) => handleRowMouseEnter(e, application.reason)}
                                            onMouseMove={handleRowMouseMove}
                                            onMouseLeave={handleRowMouseLeave}
                                            style={{
                                                cursor: 'pointer',
                                                transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                                                backgroundColor: isSelected ? '#eff6ff' : undefined,
                                                boxShadow: isSelected ? 'inset 3px 0 0 #2563eb' : undefined,
                                            }}
                                            className={`hover:bg-blue-50 ${isSelected ? 'ring-1 ring-inset ring-blue-200' : ''}`}
                                        >
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
                                                            onClick={() => showConfirmation(application.id, 'accepted', application.users?.full_name)}
                                                            className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => showConfirmation(application.id, 'rejected', application.users?.full_name)}
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

            {/* ── Hover Tooltip ── */}
            {tooltip.visible && (
                <div
                    style={{
                        position: 'fixed',
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999,
                        pointerEvents: 'none',
                        animation: 'tooltipFadeIn 0.15s ease',
                    }}
                >
                    <div
                        style={{
                            background: 'rgba(17, 24, 39, 0.92)',
                            backdropFilter: 'blur(6px)',
                            color: '#f9fafb',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            maxWidth: '280px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                            fontSize: '13px',
                            lineHeight: '1.5',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <svg style={{ width: '14px', height: '14px', marginTop: '2px', flexShrink: 0, color: '#93c5fd' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '11px', color: '#93c5fd', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</div>
                                <div style={{ wordBreak: 'break-word' }}>{tooltip.reason}</div>
                            </div>
                        </div>
                        {/* Tooltip arrow */}
                        <div style={{
                            position: 'absolute',
                            bottom: '-6px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid rgba(17, 24, 39, 0.92)',
                        }} />
                    </div>
                </div>
            )}

            {/* ── Detail Modal ── */}
            {selectedApplication && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50"
                    style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', animation: 'modalFadeIn 0.2s ease' }}
                    onClick={closeDetailModal}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
                        style={{ animation: 'modalSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between"
                            style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-xl">
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Leave Application Details</h3>
                                    <p className="text-xs text-gray-500">Full information for this request</p>
                                </div>
                            </div>
                            <button
                                onClick={closeDetailModal}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="px-6 py-5 space-y-4">
                            {/* Status banner */}
                            <div className="flex items-center justify-between p-3 rounded-xl"
                                style={{
                                    background: selectedApplication.status === 'accepted' ? '#f0fdf4'
                                        : selectedApplication.status === 'rejected' ? '#fef2f2'
                                            : '#fefce8'
                                }}>
                                <div className="flex items-center gap-2">
                                    <span
                                        style={{
                                            width: 10, height: 10, borderRadius: '50%',
                                            background: getStatusDotColor(selectedApplication.status),
                                            display: 'inline-block',
                                            boxShadow: `0 0 0 3px ${selectedApplication.status === 'accepted' ? '#bbf7d0'
                                                : selectedApplication.status === 'rejected' ? '#fecaca' : '#fde68a'}`
                                        }}
                                    />
                                    <span className={`text-sm font-semibold ${getStatusColor(selectedApplication.status)} px-2 py-0.5 rounded-full`}>
                                        {selectedApplication.status.charAt(0).toUpperCase() + selectedApplication.status.slice(1)}
                                    </span>
                                </div>
                                <span className="text-xs text-gray-500">
                                    Applied {new Date(selectedApplication.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </span>
                            </div>

                            {/* Details grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <DetailField
                                    icon={
                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    }
                                    label="Employee Name"
                                    value={selectedApplication.users?.full_name || 'N/A'}
                                />
                                <DetailField
                                    icon={
                                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                        </svg>
                                    }
                                    label="Leave Type"
                                    value={selectedApplication.leave_type ? (selectedApplication.leave_type.charAt(0).toUpperCase() + selectedApplication.leave_type.slice(1)) : 'N/A'}
                                />
                                <DetailField
                                    icon={
                                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    }
                                    label="Start Date"
                                    value={formatDate(selectedApplication.start_date)}
                                />
                                <DetailField
                                    icon={
                                        <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    }
                                    label="End Date"
                                    value={formatDate(selectedApplication.end_date)}
                                />
                            </div>

                            {/* Reason — full width */}
                            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</span>
                                </div>
                                <p className="text-sm text-gray-800 leading-relaxed">
                                    {selectedApplication.reason || <span className="text-gray-400 italic">No reason provided</span>}
                                </p>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            {selectedApplication.status === 'pending' && (
                                <>
                                    <button
                                        onClick={() => {
                                            showConfirmation(selectedApplication.id, 'rejected', selectedApplication.users?.full_name)
                                            closeDetailModal()
                                        }}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => {
                                            showConfirmation(selectedApplication.id, 'accepted', selectedApplication.users?.full_name)
                                            closeDetailModal()
                                        }}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                    >
                                        Accept
                                    </button>
                                </>
                            )}
                            <button
                                onClick={closeDetailModal}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Message */}
            {showSuccessMessage && (
                <div className="fixed top-4 right-4 bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-lg shadow-lg z-50">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Leave application status updated successfully!</span>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            {confirmDialog.show && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Confirm {confirmDialog.action === 'accepted' ? 'Accept' : 'Reject'}
                            </h3>
                            <p className="text-gray-600">
                                Are you sure you want to <span className="font-semibold">{confirmDialog.action === 'accepted' ? 'accept' : 'reject'}</span> the leave application
                                {confirmDialog.minerName && (
                                    <span> from <span className="font-semibold">{confirmDialog.minerName}</span></span>
                                )}?
                            </p>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={handleCancelAction}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                className={`px-4 py-2 text-white rounded-lg transition-colors font-medium ${confirmDialog.action === 'accepted'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-red-600 hover:bg-red-700'
                                    }`}
                            >
                                Confirm {confirmDialog.action === 'accepted' ? 'Accept' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tooltip & modal animations */}
            <style>{`
                @keyframes tooltipFadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes modalFadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes modalSlideUp {
                    from { opacity: 0; transform: translateY(24px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    )
}

// Small helper component for the detail modal fields
function DetailField({ icon, label, value }) {
    return (
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-1.5 mb-1">
                {icon}
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-sm font-medium text-gray-800">{value}</p>
        </div>
    )
}

export default SupervisorLeaveManagement
