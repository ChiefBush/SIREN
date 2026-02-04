import { useState, useEffect } from 'react'
import { sensorSupabase } from '../lib/supabase'

/**
 * Reusable hook for fetching and managing sensor data
 * @param {string} userId - Optional user ID to filter sensor data
 * @param {string} userEmail - The email of the user to check if they should have real data
 * @param {boolean} useRealData - Whether to fetch from database or use synthetic data
 */
export function useSensorData(userId = null, userEmail = null, useRealData = true) {
    const TARGET_MINER_EMAIL = 'akpnvfbel@yomail.info'
    const normalizedEmail = userEmail?.toLowerCase()

    const [sensorData, setSensorData] = useState({
        mq2: 0.0,
        mq9: 0.0,
        mq135: 0.0,
        temperature: 0.0,
        humidity: 0.0,
        accel: 0.0,
        gyro: 0.0,
        bpm: 0,
        spo2: 0,
        emergency: false,
        wristbandConnected: false,
        airQuality: 'Unknown'
    })
    const [sensorHistory, setSensorHistory] = useState([])
    const [loading, setLoading] = useState(true)

    // Fetch latest sensor data
    useEffect(() => {
        // Only fetch real data if it's the target miner
        if (useRealData && normalizedEmail === TARGET_MINER_EMAIL) {
            const fetchLatestData = async () => {
                try {
                    // Fetch latest overall data from the sensor database
                    let query = sensorSupabase
                        .from('sensor_data')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .order('timestamp', { ascending: false }) // Fallback order
                        .limit(1)

                    const { data, error } = await query

                    if (error) {
                        console.error('Error fetching sensor data:', error)
                    } else if (data && data.length > 0) {
                        const latest = data[0]
                        setSensorData({
                            mq2: parseFloat(latest.mq2_analog || latest.mq2) || 0.0,
                            mq9: parseFloat(latest.mq9_analog || latest.mq9) || 0.0,
                            mq135: parseFloat(latest.mq135_analog || latest.mq135) || 0.0,
                            temperature: parseFloat(latest.temperature || latest.dht11_temp) || 0.0,
                            humidity: parseFloat(latest.humidity || latest.dht11_humidity) || 0.0,
                            accel: parseFloat(latest.motion_accel || latest.accel) || 0.0,
                            gyro: parseFloat(latest.motion_gyro || latest.gyro) || 0.0,
                            bpm: parseInt(latest.bpm) || 0,
                            spo2: parseInt(latest.spo2) || 0,
                            emergency: latest.emergency || false,
                            wristbandConnected: latest.wristband_connected || false,
                            airQuality: latest.air_quality || 'Good'
                        })
                    }
                } catch (error) {
                    console.error('Error in fetchLatestData:', error)
                } finally {
                    setLoading(false)
                }
            }

            fetchLatestData()

            // Set up real-time subscription for latest data
            const channel = sensorSupabase
                .channel('sensor-data-realtime')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'sensor_data'
                }, (payload) => {
                    const latest = payload.new
                    setSensorData({
                        mq2: parseFloat(latest.mq2_analog || latest.mq2) || 0.0,
                        mq9: parseFloat(latest.mq9_analog || latest.mq9) || 0.0,
                        mq135: parseFloat(latest.mq135_analog || latest.mq135) || 0.0,
                        temperature: parseFloat(latest.temperature || latest.dht11_temp) || 0.0,
                        humidity: parseFloat(latest.humidity || latest.dht11_humidity) || 0.0,
                        accel: parseFloat(latest.motion_accel || latest.accel) || 0.0,
                        gyro: parseFloat(latest.motion_gyro || latest.gyro) || 0.0,
                        bpm: parseInt(latest.bpm) || 0,
                        spo2: parseInt(latest.spo2) || 0,
                        emergency: latest.emergency || false,
                        wristbandConnected: latest.wristband_connected || false,
                        airQuality: latest.air_quality || 'Good'
                    })
                })
                .subscribe()

            return () => {
                sensorSupabase.removeChannel(channel)
            }
        } else if (normalizedEmail && normalizedEmail !== TARGET_MINER_EMAIL) {
            setLoading(false)
        } else if (!normalizedEmail && !userId) {
            // No email and no userId to wait for, stop loading
            setLoading(false)
        }
        // If we have userId but no email yet, keep loading true
    }, [userId, normalizedEmail, useRealData])

    // Fetch sensor history for charts
    useEffect(() => {
        // Fetch history if it's the target miner OR if it's a supervisor summary view (userId is null)
        const canViewHistory = useRealData && (normalizedEmail === TARGET_MINER_EMAIL || !userId);

        if (canViewHistory) {
            const fetchHistory = async () => {
                try {
                    let query = sensorSupabase
                        .from('sensor_data')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .order('timestamp', { ascending: false }) // Fallback order
                        .limit(100)

                    const { data, error } = await query

                    if (error) {
                        console.error('Error fetching sensor history:', error);
                    } else if (data && data.length > 0) {
                        // Reverse the data because we fetched latest 100 in descending order
                        const historicalData = [...data].reverse()

                        setSensorHistory(historicalData.map(item => ({
                            time: new Date(item.created_at || item.timestamp || new Date()),
                            mq2: parseFloat(item.mq2_analog || item.mq2) || 0.0,
                            mq9: parseFloat(item.mq9_analog || item.mq9) || 0.0,
                            mq135: parseFloat(item.mq135_analog || item.mq135) || 0.0,
                            temperature: parseFloat(item.temperature || item.dht11_temp) || 0.0,
                            humidity: parseFloat(item.humidity || item.dht11_humidity) || 0.0,
                            accel: parseFloat(item.motion_accel || item.accel) || 0.0,
                            gyro: parseFloat(item.motion_gyro || item.gyro) || 0.0,
                            bpm: parseInt(item.bpm) || 0,
                            spo2: parseInt(item.spo2) || 0,
                            emergency: item.emergency || false
                        })))
                    }
                } catch (error) {
                    console.error('Error in fetchHistory:', error)
                }
            }

            fetchHistory()
        }
    }, [userId, normalizedEmail, useRealData])

    // Helper function to get sensor status
    const getSensorStatus = (value, warningThreshold, criticalThreshold) => {
        if (value >= criticalThreshold) return { status: 'critical', color: 'red', text: 'Critical' }
        if (value >= warningThreshold) return { status: 'warning', color: 'yellow', text: 'Warning' }
        return { status: 'safe', color: 'green', text: 'Safe' }
    }

    return {
        sensorData,
        sensorHistory,
        loading,
        getSensorStatus
    }
}

