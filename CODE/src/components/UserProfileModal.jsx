import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function UserProfileModal({ isOpen, onClose, user, onUpdate, isAdminView = false }) {
    const [formData, setFormData] = useState({
        full_name: '',
        contact_number: '',
        emergency_contact_2: '',
        blood_type: '',
        employee_id: '',
        email: '',
        role: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (user && isOpen) {
            setFormData({
                full_name: user.full_name || '',
                contact_number: user.contact_number || '',
                emergency_contact_2: user.emergency_contact_2 || '',
                blood_type: user.blood_type || '',
                employee_id: user.employee_id || '',
                email: user.email || '',
                role: user.role || 'miner'
            })
        }
    }, [user?.id, isOpen])

    if (!isOpen) return null

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }


    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const updates = {
                full_name: formData.full_name,
                contact_number: formData.contact_number,
                emergency_contact_2: formData.emergency_contact_2,
                blood_type: formData.blood_type,
                employee_id: formData.employee_id,
                role: formData.role
            }

            const { error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', user.id)

            if (error) throw error

            if (onUpdate) onUpdate()
            onClose()
        } catch (err) {
            console.error('Error updating profile:', err)
            setError(err.message || 'Failed to update profile. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
                    <h2 className="text-xl font-bold text-gray-900">Edit Profile</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto p-6 space-y-4">
                    <form id="profile-form" onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-200">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-center mb-6">
                            <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center border-2 border-blue-200">
                                <span className="text-3xl text-blue-600 font-bold uppercase">
                                    {formData.full_name?.charAt(0) || user.email?.charAt(0) || '?'}
                                </span>
                            </div>
                        </div>


                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                            <input
                                type="text"
                                name="employee_id"
                                value={formData.employee_id}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter Employee ID"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 bg-gray-100 rounded-md text-gray-500 cursor-not-allowed"
                            />
                            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                            <input
                                type="text"
                                name="full_name"
                                value={formData.full_name}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Your full name"
                            />
                        </div>


                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact 1 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    name="contact_number"
                                    required
                                    value={formData.contact_number}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+1234567890"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact 2 (Optional)</label>
                                <input
                                    type="text"
                                    name="emergency_contact_2"
                                    value={formData.emergency_contact_2}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+1234567890"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Blood Type</label>
                            <select
                                name="blood_type"
                                value={formData.blood_type}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select Blood Type</option>
                                <option value="A+">A+</option>
                                <option value="A-">A-</option>
                                <option value="B+">B+</option>
                                <option value="B-">B-</option>
                                <option value="AB+">AB+</option>
                                <option value="AB-">AB-</option>
                                <option value="O+">O+</option>
                                <option value="O-">O-</option>
                            </select>
                        </div>

                        {isAdminView && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <label className="block text-sm font-semibold text-blue-800 mb-2 flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M2.166 4.9L10 1.55l7.834 3.35a1 1 0 01.666.92v6.513a1 1 0 01-.273.662L10 19.35l-8.227-6.355A1 1 0 011.5 12.333V5.82a1 1 0 01.666-.92zM10 3.333L3.5 6.111v6.222L10 17.652l6.5-5.319V6.111L10 3.333z" clipRule="evenodd" />
                                    </svg>
                                    Administrative: Change Role
                                </label>
                                <select
                                    name="role"
                                    value={formData.role}
                                    onChange={(e) => {
                                        const newRole = e.target.value;
                                        if (window.confirm(`CRITICAL: Are you sure you want to change this user's role to ${newRole.toUpperCase()}? This will immediately change their dashboard and permissions.`)) {
                                            handleChange(e);
                                        }
                                    }}
                                    className="w-full px-3 py-2 border border-blue-300 bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-blue-900"
                                >
                                    <option value="miner">Miner (Standard restricted access)</option>
                                    <option value="supervisor">Supervisor (Can manage miners & view logs)</option>
                                    <option value="admin">Admin (Full system control)</option>
                                </select>
                            </div>
                        )}
                    </form>
                </div>

                <div className="flex justify-end space-x-3 p-6 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-lg">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="profile-form"
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center shadow-sm"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Saving...
                            </>
                        ) : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}
