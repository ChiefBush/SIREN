import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

/**
 * DHT11 Chart component showing Temperature and Humidity
 */
function DHT11Chart({ data, height = 300, isDashboard = false }) {
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
            <h3 className={`${titleSize} font-semibold text-gray-900 ${isDashboard ? 'mb-6' : 'mb-4'}`}>DHT11 - Temperature & Humidity</h3>
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
                        yAxisId="temp"
                        orientation="left"
                        label={{ value: '°C', angle: -90, position: 'insideLeft', style: { fontSize, textAnchor: 'middle' } }}
                    />
                    <YAxis
                        stroke="#6b7280"
                        style={{ fontSize }}
                        tick={{ fill: '#6b7280' }}
                        yAxisId="humidity"
                        orientation="right"
                        label={{ value: '%', angle: 90, position: 'insideRight', style: { fontSize, textAnchor: 'middle' } }}
                    />
                    <Tooltip
                        formatter={(value, name) => {
                            if (name === 'temperature') return [`${value.toFixed(1)} °C`, 'Temperature']
                            if (name === 'humidity') return [`${value.toFixed(1)} %`, 'Humidity']
                            return [value, name]
                        }}
                        labelFormatter={(label) => `Time: ${formatTime(label)}`}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="temperature"
                        stroke="#ef4444"
                        strokeWidth={isDashboard ? 2.5 : 2}
                        dot={false}
                        yAxisId="temp"
                        name="Temperature"
                    />
                    <Line
                        type="monotone"
                        dataKey="humidity"
                        stroke="#06b6d4"
                        strokeWidth={isDashboard ? 2.5 : 2}
                        dot={false}
                        yAxisId="humidity"
                        name="Humidity"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export default DHT11Chart

