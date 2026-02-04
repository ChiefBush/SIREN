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

    // Prepare data for charts (convert Date objects to timestamps for recharts)
    const chartData = sensorHistory.map(item => ({
        ...item,
        time: item.time.getTime()
    }))

    // Sample data to reduce congestion - show every 3rd point for cleaner display
    const sampledData = chartData.filter((_, index) => index % 3 === 0)

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Sensor Data Charts</h3>
            </div>

            {/* Charts Grid - 3 charts in one row, responsive */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart 1: Combined MQ Sensors */}
                <div className="h-full">
                    <CombinedMQChart
                        data={sampledData}
                        height={300}
                        isDashboard={false}
                    />
                </div>

                {/* Chart 2: DHT11 (Temperature + Humidity) */}
                <div className="h-full">
                    <DHT11Chart
                        data={sampledData}
                        height={300}
                        isDashboard={false}
                    />
                </div>

                {/* Chart 3: Fall Detection (Accelerometer + Gyroscope) */}
                <div className="h-full">
                    <FallDetectionChart
                        data={sampledData}
                        height={300}
                        isDashboard={false}
                    />
                </div>
            </div>
        </div>
    )
}

export default DashboardCharts

