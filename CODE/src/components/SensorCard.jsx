/**
 * Reusable sensor card component
 */
function SensorCard({ icon, title, subtitle, value, unit, status, warningThreshold, criticalThreshold, statusText = 'Stable' }) {
    const isHumidity = title === 'Humidity'
    const humidityOffline = isHumidity && value === 0

    const statusBadgeClass =
        status.status === 'safe' ? 'bg-green-100 text-green-800' :
        status.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
        status.status === 'error' ? 'bg-gray-100 text-gray-600' :
            'bg-red-100 text-red-800'

    return (
        <div className="bg-white rounded-lg p-4 shadow-md">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-2">
                    <span className="text-2xl">{icon}</span>
                    <div>
                        <h4 className="font-semibold text-gray-900">{title}</h4>
                        <p className="text-xs text-gray-500">{subtitle}</p>
                    </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeClass}`}>
                    {status.text}
                </span>
            </div>
            <div className={`text-2xl font-bold ${humidityOffline ? 'text-gray-400' : 'text-gray-900'}`}>
                {humidityOffline ? 'N/A' : `${(value || 0).toFixed(1)} ${unit}`}
            </div>
            <div className="text-xs text-gray-500 mt-2 text-right">Status: <span className="font-semibold">{statusText}</span></div>
            <div className="text-xs text-gray-400 mt-1">W: {warningThreshold} | C: {criticalThreshold}</div>
        </div>
    )
}

export default SensorCard

