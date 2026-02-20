import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function SupervisorIncidentReports({ userId, userEmail, isAdmin = false }) {
    const [incidents, setIncidents] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [formData, setFormData] = useState({
        incident_type: 'hazard',
        severity: 'low',
        location: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        status: 'reported'
    })
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this incident report?")) return
        try {
            setLoading(true)
            const { error } = await supabase.from('incidents').delete().eq('id', id)
            if (error) throw error
            setSuccess('Incident deleted successfully')
            fetchIncidents()
        } catch (err) {
            setError('Failed to delete incident: ' + err.message)
            setLoading(false)
        }
    }

    const handleResolve = async (id) => {
        try {
            setLoading(true)
            const { error } = await supabase.from('incidents').update({ status: 'resolved' }).eq('id', id)
            if (error) throw error
            setSuccess('Incident marked as resolved')
            fetchIncidents()
        } catch (err) {
            setError('Failed to resolve incident: ' + err.message)
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchIncidents()
    }, [])

    const fetchIncidents = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('incidents')
                .select(`
          *,
          reporter:reported_by(full_name, email, role)
        `)
                .order('date', { ascending: false })

            if (error) throw error
            setIncidents(data || [])
        } catch (err) {
            console.error('Error fetching incidents:', err)
            setError('Failed to load incidents')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()

            const incidentData = {
                ...formData
            }

            if (!editingId && !incidentData.reported_by) {
                incidentData.reported_by = user.id
            }

            let query = supabase.from('incidents')
            if (editingId) {
                query = query.update(incidentData).eq('id', editingId)
            } else {
                query = query.insert(incidentData)
            }

            const { error } = await query

            if (error) throw error

            setSuccess(editingId ? 'Incident updated successfully' : 'Incident reported successfully')
            setIsModalOpen(false)
            setEditingId(null)
            setFormData({
                incident_type: 'hazard',
                severity: 'low',
                location: '',
                description: '',
                date: new Date().toISOString().split('T')[0],
                status: 'reported'
            })
            fetchIncidents()
        } catch (err) {
            console.error('Error submitting incident:', err)
            setError('Failed to submit report: ' + err.message)
        }
    }

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'bg-red-100 text-red-800'
            case 'high': return 'bg-orange-100 text-orange-800'
            case 'medium': return 'bg-yellow-100 text-yellow-800'
            case 'low': return 'bg-green-100 text-green-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'reported': return 'bg-blue-100 text-blue-800'
            case 'in_progress': return 'bg-yellow-100 text-yellow-800'
            case 'resolved': return 'bg-green-100 text-green-800'
            case 'closed': return 'bg-gray-100 text-gray-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Incident Reports</h2>
                    <p className="text-gray-600 mt-1">Track and manage safety incidents</p>
                </div>
                <button
                    onClick={() => {
                        setEditingId(null)
                        setFormData({
                            incident_type: 'hazard',
                            severity: 'low',
                            location: '',
                            description: '',
                            date: new Date().toISOString().split('T')[0],
                            status: 'reported'
                        })
                        setIsModalOpen(true)
                    }}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Report Incident</span>
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-200">
                    {success}
                </div>
            )}

            {/* Incidents Table */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Severity</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reported By</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                {isAdmin && <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">Loading incidents...</td>
                                </tr>
                            ) : incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">No incidents reported yet.</td>
                                </tr>
                            ) : (
                                incidents.map((incident) => (
                                    <tr key={incident.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {new Date(incident.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                                            {incident.incident_type.replace('_', ' ')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${getSeverityColor(incident.severity)}`}>
                                                {incident.severity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {incident.location}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={incident.description}>
                                            {incident.description}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {incident.reporter?.full_name || 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${getStatusColor(incident.status)}`}>
                                                {incident.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                                                {incident.status !== 'resolved' && (
                                                    <button onClick={() => handleResolve(incident.id)} className="text-green-600 hover:text-green-800 font-medium text-sm">Resolve</button>
                                                )}
                                                <button onClick={() => {
                                                    setEditingId(incident.id)
                                                    setFormData({
                                                        incident_type: incident.incident_type,
                                                        severity: incident.severity,
                                                        location: incident.location,
                                                        description: incident.description,
                                                        date: incident.date,
                                                        status: incident.status
                                                    })
                                                    setIsModalOpen(true)
                                                }} className="text-blue-600 hover:text-blue-800 font-medium text-sm ml-2">Edit</button>
                                                <button onClick={() => handleDelete(incident.id)} className="text-red-600 hover:text-red-800 font-medium text-sm ml-2">Delete</button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Report Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Incident' : 'Report New Incident'}</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Incident Type</label>
                                <select
                                    required
                                    value={formData.incident_type}
                                    onChange={(e) => setFormData({ ...formData, incident_type: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                                >
                                    <option value="hazard">Hazard</option>
                                    <option value="accident">Accident</option>
                                    <option value="near_miss">Near Miss</option>
                                    <option value="equipment_failure">Equipment Failure</option>
                                    <option value="environmental">Environmental</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                                <select
                                    required
                                    value={formData.severity}
                                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>

                            {isAdmin && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select
                                        required
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                                    >
                                        <option value="reported">Reported</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="resolved">Resolved</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g., Zone A, Shaft 3"
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    required
                                    rows="3"
                                    placeholder="Describe what happened..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                                ></textarea>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                                >
                                    Submit Report
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default SupervisorIncidentReports
