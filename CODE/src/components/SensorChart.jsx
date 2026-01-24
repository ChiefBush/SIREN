import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

/**
 * Reusable time-series chart component for sensor data
 */
function SensorChart({ data, dataKey, name, color, unit = '', height = 300 }) {
    const formatTime = (tickItem) => {
        if (!tickItem) return ''
        const date = typeof tickItem === 'number' ? new Date(tickItem) : tickItem
        if (isNaN(date.getTime())) return ''
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }

    return (
        <div className="bg-white rounded-lg p-4 shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{name}</h3>
            <ResponsiveContainer width="100%" height={height}>
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                        dataKey="time"
                        tickFormatter={formatTime}
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        label={{ value: unit, angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
                    />
                    <Tooltip
                        formatter={(value) => [`${value.toFixed(1)} ${unit}`, name]}
                        labelFormatter={(label) => `Time: ${formatTime(label)}`}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        name={name}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export default SensorChart

