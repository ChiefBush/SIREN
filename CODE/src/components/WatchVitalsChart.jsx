import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

/**
 * Watch Vitals Chart component showing Heart Rate and SpO2 data
 * Filters out rows where both bpm and spo2 are 0 so lines render correctly.
 */
function WatchVitalsChart({ data, height = 300, isDashboard = false }) {
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

    // Keep rows that have at least a non-zero BPM or non-zero SpO2
    // Replace 0 values with null so Recharts does NOT connect the gap
    const chartData = data
        .filter(item => item.bpm > 0 || item.spo2 > 0)
        .map(item => ({
            ...item,
            bpm: item.bpm > 0 ? item.bpm : null,
            spo2: item.spo2 > 0 ? item.spo2 : null
        }))

    const hasBpm = chartData.some(d => d.bpm !== null)
    const hasSpo2 = chartData.some(d => d.spo2 !== null)
    const hasNoData = !hasBpm && !hasSpo2

    return (
        <div className={`bg-white rounded-lg ${isDashboard ? 'p-6' : 'p-4'} shadow-md h-full`}>
            <div className="flex items-center justify-between">
                <h3 className={`${titleSize} font-semibold text-gray-900 ${isDashboard ? 'mb-2' : 'mb-2'}`}>Smartwatch Vitals</h3>
                <div className="flex items-center space-x-3 mb-2">
                    {hasBpm && (
                        <span className="flex items-center space-x-1 text-xs text-red-500 font-semibold">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block"></span>
                            <span>BPM Live</span>
                        </span>
                    )}
                    {!hasSpo2 && (
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">SpO₂ sensor not reading</span>
                    )}
                </div>
            </div>

            {hasNoData ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
                    <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <p className="text-sm font-medium">No wristband readings yet</p>
                    <p className="text-xs text-gray-300">Wear the smartwatch and data will appear here</p>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={height}>
                    <LineChart data={chartData} margin={chartMargin}>
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
                            yAxisId="bpm"
                            orientation="left"
                            domain={[0, 'auto']}
                            label={{ value: 'BPM', angle: -90, position: 'insideLeft', style: { fontSize, textAnchor: 'middle' } }}
                        />
                        {hasSpo2 && (
                            <YAxis
                                stroke="#6b7280"
                                style={{ fontSize }}
                                tick={{ fill: '#6b7280' }}
                                yAxisId="spo2"
                                orientation="right"
                                domain={[80, 100]}
                                label={{ value: 'SpO₂%', angle: 90, position: 'insideRight', style: { fontSize, textAnchor: 'middle' } }}
                            />
                        )}
                        <Tooltip
                            formatter={(value, name) => {
                                if (value === null || value === undefined) return ['--', name]
                                if (name === 'Heart Rate') return [`${value} BPM`, 'Heart Rate']
                                if (name === 'Blood O₂') return [`${value}%`, 'Blood O₂']
                                return [value, name]
                            }}
                            labelFormatter={(label) => `Time: ${formatTime(label)}`}
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                        />
                        <Legend />
                        {hasBpm && (
                            <Line
                                type="monotone"
                                dataKey="bpm"
                                stroke="#ef4444"
                                strokeWidth={isDashboard ? 2.5 : 2}
                                dot={{ r: 3, fill: '#ef4444' }}
                                activeDot={{ r: 5 }}
                                yAxisId="bpm"
                                name="Heart Rate"
                                connectNulls={true}
                            />
                        )}
                        {hasSpo2 && (
                            <Line
                                type="monotone"
                                dataKey="spo2"
                                stroke="#3b82f6"
                                strokeWidth={isDashboard ? 2.5 : 2}
                                dot={{ r: 3, fill: '#3b82f6' }}
                                activeDot={{ r: 5 }}
                                yAxisId="spo2"
                                name="Blood O₂"
                                connectNulls={true}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    )
}

export default WatchVitalsChart
