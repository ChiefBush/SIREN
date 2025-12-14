import { useNavigate } from 'react-router-dom'

function AdminDashboard({ onLogout }) {
  const navigate = useNavigate()

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout()
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with Logout */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-4xl font-bold text-gray-900">admin</div>
        </div>
      </main>
    </div>
  )
}

export default AdminDashboard

