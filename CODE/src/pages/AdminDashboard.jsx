import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import UserProfileModal from '../components/UserProfileModal'
import Footer from '../components/Footer'

function AdminDashboard({ onLogout }) {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)

  // Admin specific state
  const [users, setUsers] = useState([])
  const [roleFilter, setRoleFilter] = useState('All')
  const [activeMenuId, setActiveMenuId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  const menuRef = useRef(null)

  useEffect(() => {
    fetchCurrentUser()
    fetchAllUsers()

    // Click outside listener to close menus
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchCurrentUser = async () => {
    try {
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
    } catch (error) {
      console.error('Error fetching current user:', error)
    }
  }

  const fetchAllUsers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setUsers(data || [])
    } catch (error) {
      console.error('Error fetching logs:', error)
      setUsers([
        { id: '1', full_name: 'John Doe', role: 'miner', employee_id: 'MIN-001' },
        { id: '2', full_name: 'Jane Smith', role: 'supervisor', employee_id: 'SUP-001' },
        { id: '3', full_name: 'Admin User', role: 'admin', employee_id: 'ADM-001' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout()
    }
    navigate('/')
  }

  const handleAction = (action, targetUser) => {
    if (action === 'Edit') {
      setEditingUser(targetUser)
      setIsProfileOpen(true)
    } else if (action === 'Delete') {
      handleDeleteUser(targetUser)
    }
    setActiveMenuId(null)
  }

  const handleDeleteUser = async (targetUser) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete user ${targetUser.full_name || targetUser.email}? This action will permanently remove their profile data.`
    )

    if (confirmDelete) {
      try {
        setLoading(true)
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', targetUser.id)

        if (error) throw error

        alert('User deleted successfully')
        fetchAllUsers() // Refresh the list
      } catch (error) {
        console.error('Error deleting user:', error)
        alert('Failed to delete user: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const [editingUser, setEditingUser] = useState(null)

  const filteredUsers = users.filter(user => {
    if (roleFilter === 'All') return true
    return user.role?.toLowerCase() === roleFilter.toLowerCase()
  })

  const handleRowClick = (userItem) => {
    // Prevent navigation if menu or modal is open
    if (activeMenuId) return

    if (userItem.role?.toLowerCase() === 'miner') {
      navigate(`/admin/miner/${userItem.id}`)
    } else if (userItem.role?.toLowerCase() === 'supervisor') {
      navigate(`/admin/supervisor/${userItem.id}`)
    }
  }

  const menuItems = [
    { id: 'dashboard', label: 'User Logs', icon: '📋' },
  ]

  const getRoleBadgeColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin': return 'bg-red-100 text-red-800'
      case 'supervisor': return 'bg-purple-100 text-purple-800'
      case 'miner': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-gray-800 text-white flex flex-col">
        {/* Logo Section */}
        <div className="h-24 flex items-center px-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <Logo className="h-16" />
            <div>
              <h1 className="text-xl font-bold">SIREN</h1>
              <p className="text-xs text-gray-400">Admin Portal</p>
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

        {/* Logout Button */}
        <div className="h-20 flex items-center px-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 h-24 flex items-center">
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="text-gray-600 flex items-center space-x-4">
              <button
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                  <div className="text-xs font-bold text-blue-600 uppercase">
                    {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </div>
                </div>
                <span className="font-medium">{userProfile?.full_name || user?.email || 'Admin'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="space-y-6">
            {/* Page Title */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900">User Logs</h2>
              <p className="text-gray-600 mt-1">Manage and monitor system users and their roles</p>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm w-fit border border-gray-200">
              {['All', 'Miner', 'Supervisor', 'Admin'].map(role => (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${roleFilter === role
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Users Log Table */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-visible">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold">Name</th>
                      <th className="px-6 py-4 font-semibold">Unique ID</th>
                      <th className="px-6 py-4 font-semibold">Role</th>
                      <th className="px-6 py-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                          Loading user data...
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                          No users found with role "{roleFilter}"
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((userItem) => (
                        <tr
                          key={userItem.id}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => handleRowClick(userItem)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold mr-3">
                                {userItem.full_name?.charAt(0) || userItem.email?.charAt(0) || '?'}
                              </div>
                              <div className="font-medium text-gray-900">{userItem.full_name || 'N/A'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-gray-600">
                            {userItem.employee_id || userItem.id?.slice(0, 8) || 'N/A'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(userItem.role)}`}>
                              {userItem.role || 'Unassigned'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right relative">
                            <div
                              className="inline-block relative"
                              ref={activeMenuId === userItem.id ? menuRef : null}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActiveMenuId(activeMenuId === userItem.id ? null : userItem.id)
                                }}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                              >
                                <span className="text-xl font-bold leading-none">⋮</span>
                              </button>

                              {activeMenuId === userItem.id && (
                                <div
                                  className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200 ring-1 ring-black ring-opacity-5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => handleAction('Edit', userItem)}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleAction('Delete', userItem)}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                Showing {filteredUsers.length} {roleFilter === 'All' ? 'users' : roleFilter.toLowerCase() + ' accounts'}
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false)
          setEditingUser(null)
        }}
        user={editingUser || { ...user, ...userProfile }}
        onUpdate={() => {
          fetchCurrentUser()
          fetchAllUsers()
        }}
        isAdminView={!!editingUser}
      />
    </div>
  )
}

export default AdminDashboard
