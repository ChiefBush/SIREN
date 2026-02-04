import { useSensorData } from '../hooks/useSensorData'
import SensorCard from '../components/SensorCard'
import SensorChart from '../components/SensorChart'


function SensorMetrics({ userId = null, userEmail = null }) {
    const { sensorData, sensorHistory, loading, getSensorStatus } = useSensorData(userId, userEmail)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600">Loading sensor data...</div>
            </div>
        )
    }

    // Calculate sensor statuses
    const mq2Status = getSensorStatus(sensorData.mq2, 300, 500)
    const mq9Status = getSensorStatus(sensorData.mq9, 200, 400)
    const mq135Status = getSensorStatus(sensorData.mq135, 400, 700)
    const tempStatus = getSensorStatus(sensorData.temperature, 35, 45)
    const humidityStatus = getSensorStatus(sensorData.humidity, 80, 95)

    // Prepare data for charts (convert Date objects to timestamps for recharts)
    const chartData = sensorHistory.map(item => ({
        ...item,
        time: item.time.getTime()
    }))

    return (
        <div className="space-y-6">
            {/* Emergency alert banner */}
            {sensorData.emergency && (
                <div className="bg-red-600 text-white p-6 rounded-lg shadow-xl animate-pulse flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="bg-white bg-opacity-20 p-3 rounded-full">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold italic">EMERGENCY SOS ACTIVE</h3>
                            <p className="opacity-90">Hardware emergency button has been pressed or fall detected!</p>
                        </div>
                    </div>
                    <div className="px-4 py-2 bg-white text-red-600 font-bold rounded-md">
                        IMMEDIATE ACTION REQUIRED
                    </div>
                </div>
            )}

            {/* Page Title & Status */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Sensor Metrics</h2>
                    <p className="text-gray-600 mt-1">Current sensor readings and real-time visualization</p>
                </div>
                <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg border ${sensorData.wristbandConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                    <div className={`w-3 h-3 rounded-full ${sensorData.wristbandConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                    <span className="font-semibold">{sensorData.wristbandConnected ? 'Smartband Connected' : 'Smartband Offline'}</span>
                </div>
            </div>

            {/* Sensor Data Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <SensorCard
                    icon="🔥"
                    title="MQ2"
                    subtitle="Smoke & Gas"
                    value={sensorData.mq2}
                    unit="ppm"
                    status={mq2Status}
                    warningThreshold={300}
                    criticalThreshold={500}
                />
                <SensorCard
                    icon="💨"
                    title="MQ9"
                    subtitle="CO Level"
                    value={sensorData.mq9}
                    unit="ppm"
                    status={mq9Status}
                    warningThreshold={200}
                    criticalThreshold={400}
                />
                <SensorCard
                    icon="💨"
                    title="MQ135"
                    subtitle="Air Quality"
                    value={sensorData.mq135}
                    unit="ppm"
                    status={mq135Status}
                    warningThreshold={400}
                    criticalThreshold={700}
                    statusText={sensorData.airQuality}
                />
                <SensorCard
                    icon="🌡️"
                    title="Temperature"
                    subtitle="DHT11"
                    value={sensorData.temperature}
                    unit="°C"
                    status={tempStatus}
                    warningThreshold={35}
                    criticalThreshold={45}
                />
                <SensorCard
                    icon="💧"
                    title="Humidity"
                    subtitle="DHT11"
                    value={sensorData.humidity}
                    unit="%"
                    status={humidityStatus}
                    warningThreshold={80}
                    criticalThreshold={95}
                />
            </div>

            {/* Summary Status */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-500 rounded-lg p-6 text-white shadow-md">
                    <div className="text-4xl font-bold">
                        {[mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'safe').length}
                    </div>
                    <div className="text-lg font-medium mt-2">Safe</div>
                </div>
                <div className="bg-yellow-500 rounded-lg p-6 text-white shadow-md">
                    <div className="text-4xl font-bold">
                        {[mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'warning').length}
                    </div>
                    <div className="text-lg font-medium mt-2">Warning</div>
                </div>
                <div className="bg-red-500 rounded-lg p-6 text-white shadow-md">
                    <div className="text-4xl font-bold">
                        {[mq2Status, mq9Status, mq135Status, tempStatus, humidityStatus].filter(s => s.status === 'critical').length}
                    </div>
                    <div className="text-lg font-medium mt-2">Critical</div>
                </div>
            </div>

            {/* Charts Section */}
            <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Real-time Sensor Data Visualization</h3>

                {/* Charts Grid - 2 per row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* MQ2 Chart */}
                    <SensorChart
                        data={chartData}
                        dataKey="mq2"
                        name="MQ2 - Smoke & Gas"
                        color="#f97316"
                        unit="ppm"
                        height={300}
                    />

                    {/* MQ9 Chart */}
                    <SensorChart
                        data={chartData}
                        dataKey="mq9"
                        name="MQ9 - CO Level"
                        color="#3b82f6"
                        unit="ppm"
                        height={300}
                    />

                    {/* MQ135 Chart */}
                    <SensorChart
                        data={chartData}
                        dataKey="mq135"
                        name="MQ135 - Air Quality"
                        color="#8b5cf6"
                        unit="ppm"
                        height={300}
                    />

                    {/* Temperature Chart */}
                    <SensorChart
                        data={chartData}
                        dataKey="temperature"
                        name="Temperature (DHT11)"
                        color="#ef4444"
                        unit="°C"
                        height={300}
                    />

                    {/* Humidity Chart */}
                    <SensorChart
                        data={chartData}
                        dataKey="humidity"
                        name="Humidity (DHT11)"
                        color="#06b6d4"
                        unit="%"
                        height={300}
                    />
                </div>
            </div>
        </div>
    )
}

export default SensorMetrics
