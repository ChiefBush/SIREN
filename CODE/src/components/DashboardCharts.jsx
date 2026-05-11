import { useSensorData } from '../hooks/useSensorData'
import CombinedMQChart from './CombinedMQChart'
import DHT11Chart from './DHT11Chart'
import FallDetectionChart from './FallDetectionChart'
import WatchVitalsChart from './WatchVitalsChart'

function smoothData(data, windowSize = 3) {
    if (!data || data.length < windowSize) return data
    const numericKeys = ['mq2', 'mq9', 'mq135', 'temperature', 'humidity', 'accel', 'gyro', 'bpm', 'spo2']
    const result = []
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - windowSize + 1)
        const window = data.slice(start, i + 1)
        const avg = { ...data[i] }
        for (const key of numericKeys) {
            const values = window.map(w => w[key]).filter(v => v != null && !isNaN(v))
            if (values.length > 0) {
                avg[key] = values.reduce((a, b) => a + b, 0) / values.length
            }
        }
        result.push(avg)
    }
    return result
}

/**
 * Reusable Dashboard Charts component
 * Displays 4 charts in a responsive grid layout:
 * 1. Combined MQ Sensors (MQ2, MQ9, MQ135)
 * 2. DHT11 (Temperature + Humidity)
 * 3. Fall Detection (Accelerometer + Gyroscope)
 * 4. Watch Vitals (BPM + SpO2)
 */
function DashboardCharts({ userId = null, userEmail = null, stacked = false }) {
    const { sensorHistory, loading } = useSensorData(userId, userEmail)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600">Loading charts...</div>
            </div>
        )
    }

    // Smooth and prepare data for charts
    const chartData = smoothData(sensorHistory).map(item => ({
        ...item,
        time: item.time.getTime()
    }))

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
                    <h3 className="text-xl font-bold text-gray-900">Sensor Data Graphs</h3>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">High Resolution Mode</span>
                </div>
            </div>

            {/* Charts Grid */}
            <div className={`grid ${stacked ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-6`}>
                {/* Chart 1: Combined MQ Sensors */}
                <div className="w-full">
                    <CombinedMQChart
                        data={chartData}
                        height={stacked ? 400 : 300}
                        isDashboard={true}
                    />
                </div>

                {/* Chart 2: DHT11 (Temperature + Humidity) */}
                <div className="w-full">
                    <DHT11Chart
                        data={chartData}
                        height={stacked ? 400 : 300}
                        isDashboard={true}
                    />
                </div>

                {/* Chart 3: Fall Detection (Accelerometer + Gyroscope) */}
                <div className="w-full">
                    <FallDetectionChart
                        data={chartData}
                        height={stacked ? 400 : 300}
                        isDashboard={true}
                    />
                </div>

                {/* Chart 4: Watch Vitals (Heart Rate + SpO2) */}
                <div className="w-full">
                    <WatchVitalsChart
                        data={chartData}
                        height={stacked ? 400 : 300}
                        isDashboard={true}
                    />
                </div>
            </div>
        </div>
    )
}

export default DashboardCharts

