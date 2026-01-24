/**
 * Reusable sensor card component
 */
function SensorCard({ icon, title, subtitle, value, unit, status, warningThreshold, criticalThreshold }) {
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
                <span className={`px-2 py-1 rounded text-xs font-medium ${status.status === 'safe' ? 'bg-green-100 text-green-800' :
                        status.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                    }`}>
                    {status.text}
                </span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{value.toFixed(1)} {unit}</div>
            <div className="text-xs text-gray-500 mt-2">Status: Stable</div>
            <div className="text-xs text-gray-400 mt-1">W: {warningThreshold} | C: {criticalThreshold}</div>
        </div>
    )
}

export default SensorCard

