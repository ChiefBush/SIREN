import { useSensorData } from '../hooks/useSensorData'
import CombinedMQChart from './CombinedMQChart'
import DHT11Chart from './DHT11Chart'
import FallDetectionChart from './FallDetectionChart'

/**
 * Reusable Dashboard Charts component
 * Displays 3 charts in a responsive grid layout:
 * 1. Combined MQ Sensors (MQ2, MQ9, MQ135)
 * 2. DHT11 (Temperature + Humidity)
 * 3. Fall Detection (Accelerometer + Gyroscope)
 */
function DashboardCharts({ userId = null, userEmail = null }) {
    const { sensorHistory, loading } = useSensorData(userId, userEmail)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600">Loading charts...</div>
            </div>
        )
    }

    // Use full data for better detail unless it's extremely large
    const chartData = sensorHistory.map(item => ({
        ...item,
        time: item.time.getTime()
    }))

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Sensor Telemetry History</h3>
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">High Resolution Mode</span>
                </div>
            </div>

            {/* Charts Grid - Vertically stacked for better legibility when embedded */}
            <div className="grid grid-cols-1 gap-8">
                {/* Chart 1: Combined MQ Sensors */}
                <div className="w-full">
                    <CombinedMQChart
                        data={chartData}
                        height={400}
                        isDashboard={true}
                    />
                </div>

                {/* Chart 2: DHT11 (Temperature + Humidity) */}
                <div className="w-full">
                    <DHT11Chart
                        data={chartData}
                        height={400}
                        isDashboard={true}
                    />
                </div>

                {/* Chart 3: Fall Detection (Accelerometer + Gyroscope) */}
                <div className="w-full">
                    <FallDetectionChart
                        data={chartData}
                        height={400}
                        isDashboard={true}
                    />
                </div>
            </div>
        </div>
    )
}

export default DashboardCharts

