import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function MinerLogs() {
  const navigate = useNavigate()
  const [miners, setMiners] = useState([])
  const [activeStatuses, setActiveStatuses] = useState({})

  useEffect(() => {
    fetchMiners()
    fetchActiveStatuses()
  }, [])

  useEffect(() => {
    // Refresh active statuses periodically
    const interval = setInterval(() => {
      fetchActiveStatuses()
    }, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [])

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

  const handleMinerClick = (minerId) => {
    navigate(`/supervisor/miners/${minerId}`)
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Miner Logs</h2>
        <p className="text-gray-600 mt-1">Manage miners and view health and safety logs</p>
      </div>

      {/* Miner Management Section */}
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Miner Management</h3>
          <p className="text-gray-600 mt-1">View and monitor all miners</p>
        </div>

        {miners.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600 text-lg">No miners found</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {miners.map((miner) => (
                    <tr
                      key={miner.id}
                      onClick={() => handleMinerClick(miner.id)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {miner.full_name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{miner.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{miner.employee_id || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${activeStatuses[miner.id]
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}>
                          {activeStatuses[miner.id] ? (
                            <>
                              <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                              Active
                            </>
                          ) : (
                            'Inactive'
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 font-mono">{miner.id}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Health Section - Watch Data */}
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Health Monitoring</h3>
            <p className="text-gray-600 mt-1">Real-time health data from connected watches</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {miners.map((miner) => (
              <div key={miner.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">{miner.full_name || 'N/A'}</h4>
                    <p className="text-sm text-gray-500">{miner.employee_id || 'N/A'}</p>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Heart Rate (BPM) */}
                  <div className="border-l-4 border-red-500 pl-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Heart Rate</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          <span className="text-red-600">--</span>
                          <span className="text-sm text-gray-500 ml-1">BPM</span>
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Placeholder - Watch data pending</p>
                  </div>

                  {/* SpO2 */}
                  <div className="border-l-4 border-blue-500 pl-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">SpO2</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          <span className="text-blue-600">--</span>
                          <span className="text-sm text-gray-500 ml-1">%</span>
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Placeholder - Watch data pending</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center text-xs text-gray-500">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Last updated: --</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {miners.length === 0 && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-600 text-lg">No miners available for health monitoring</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MinerLogs

