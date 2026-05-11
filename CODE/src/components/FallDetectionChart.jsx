import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function getDataDomain(data, keys, padding = 0.05) {
    if (!data || data.length === 0) return ['auto', 'auto']
    let min = Infinity
    let max = -Infinity
    for (const item of data) {
        for (const key of keys) {
            const val = item[key]
            if (val !== null && val !== undefined && !isNaN(val)) {
                min = Math.min(min, val)
                max = Math.max(max, val)
            }
        }
    }
    if (!isFinite(min) || !isFinite(max)) return ['auto', 'auto']
    const range = max - min
    const pad = range === 0 ? Math.abs(min) * 0.1 || 1 : range * padding
    return [Math.floor(min - pad), Math.ceil(max + pad)]
}

/**
 * Fall Detection Chart component showing Accelerometer and Gyroscope data
 */
function FallDetectionChart({ data, height = 300, isDashboard = false }) {
    const formatTime = (tickItem) => {
        if (!tickItem) return ''
        const date = typeof tickItem === 'number' ? new Date(tickItem) : tickItem
        if (isNaN(date.getTime())) return ''
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }

    const chartMargin = isDashboard
        ? { top: 20, right: 30, bottom: 20, left: 10 }
        : { top: 5, right: 20, bottom: 5, left: 0 }

    const fontSize = isDashboard ? '14px' : '12px'
    const titleSize = isDashboard ? 'text-xl' : 'text-lg'

    return (
        <div className={`bg-white rounded-lg ${isDashboard ? 'p-6' : 'p-4'} shadow-md h-full`}>
            <h3 className={`${titleSize} font-semibold text-gray-900 ${isDashboard ? 'mb-6' : 'mb-4'}`}>Fall Detection - Accelerometer & Gyroscope</h3>
            <ResponsiveContainer width="100%" height={height}>
                <LineChart data={data} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                    <XAxis
                        dataKey="time"
                        tickFormatter={formatTime}
                        stroke="#6b7280"
                        style={{ fontSize }}
                        tick={{ fill: '#6b7280' }}
                        interval={isDashboard ? 'preserveStartEnd' : 'auto'}
                    />
                    <YAxis
                        stroke="#6b7280"
                        style={{ fontSize }}
                        tick={{ fill: '#6b7280' }}
                        domain={getDataDomain(data, ['accel', 'gyro'])}
                        label={{ value: 'Readings', angle: -90, position: 'insideLeft', style: { fontSize, textAnchor: 'middle' } }}
                    />
                    <Tooltip
                        formatter={(value, name) => {
                            const unit = name.includes('gyro') ? ' deg/s' : ' g'
                            return [`${value.toFixed(2)}${unit}`, name]
                        }}
                        labelFormatter={(label) => `Time: ${formatTime(label)}`}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                    />
                    <Legend />
                    {/* Accelerometer line */}
                    <Line
                        type="monotone"
                        dataKey="accel"
                        stroke="#ef4444"
                        strokeWidth={isDashboard ? 2.5 : 2}
                        dot={false}
                        name="Accelerometer"
                    />
                    {/* Gyroscope line */}
                    <Line
                        type="monotone"
                        dataKey="gyro"
                        stroke="#f59e0b"
                        strokeWidth={isDashboard ? 2.5 : 2}
                        dot={false}
                        strokeDasharray="5 5"
                        name="Gyroscope"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export default FallDetectionChart

