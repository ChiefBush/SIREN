import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import MinerDashboard from './MinerDashboard'

function MinerLogs() {
  const [miners, setMiners] = useState([])
  const [activeStatuses, setActiveStatuses] = useState({})
  const [selectedMinerId, setSelectedMinerId] = useState(null)

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
        // Select the first miner by default if none selected
        if (data && data.length > 0 && !selectedMinerId) {
          setSelectedMinerId(data[0].id)
        }
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
    setSelectedMinerId(minerId)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] space-y-4">
      <div className="flex-shrink-0">
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Miner Monitoring</h2>
        <p className="text-gray-500 font-medium text-sm">Real-time supervision and health telemetry</p>
      </div>

      <div className="flex flex-1 overflow-hidden space-x-6">
        {/* Left Column: Table (50%) */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest">Miner Directory</h3>
              <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-1 rounded-full">{miners.length} TOTAL</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {miners.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-400 italic">No miners found</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-white sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee ID</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {miners.map((miner) => (
                      <tr
                        key={miner.id}
                        onClick={() => handleMinerClick(miner.id)}
                        className={`cursor-pointer transition-all duration-200 ${selectedMinerId === miner.id ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${selectedMinerId === miner.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                              {miner.full_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900">{miner.full_name || 'N/A'}</div>
                              <div className="text-[10px] text-gray-400 font-medium">{miner.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">{miner.employee_id || '---'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter ${activeStatuses[miner.id] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${activeStatuses[miner.id] ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                            {activeStatuses[miner.id] ? 'Active' : 'Offline'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Logs (50%) */}
        <div className="w-1/2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {selectedMinerId ? (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-100 bg-blue-600 flex items-center justify-between">
                <h3 className="font-bold text-white uppercase text-xs tracking-widest">Detailed Telemetry</h3>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  <span className="text-[10px] text-blue-100 font-bold uppercase tracking-widest">Live Monitor</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <MinerDashboard userId={selectedMinerId} isReadOnly={true} embedded={true} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-12 bg-gray-50/50">
              <div className="w-16 h-16 bg-blue-50 text-blue-200 rounded-3xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h4 className="text-gray-900 font-black uppercase tracking-tighter text-lg">No Miner Selected</h4>
              <p className="text-gray-500 text-sm mt-2 max-w-xs">Click on a miner record from the list to view their real-time health data and sensor history.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MinerLogs
