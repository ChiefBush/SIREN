import { useState, useEffect } from 'react'
import { supabase, sensorSupabase } from '../lib/supabase'

/**
 * Reusable hook for fetching and managing sensor data
 * @param {string} userId - Optional user ID to filter sensor data
 * @param {string} userEmail - The email of the user to check if they should have real data
 * @param {boolean} useRealData - Whether to fetch from database or use synthetic data
 */
export function useSensorData(userId = null, userEmail = null, useRealData = true) {
    const TARGET_MINER_EMAIL = 'akpnvfbel@yomail.info'
    const TARGET_MINER_NAME = 'Miner A'

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
    const [isTarget, setIsTarget] = useState(false)

    // Check if the current user/context is the target miner
    useEffect(() => {
        let mounted = true
        const checkTargetMiner = async () => {
            if (!useRealData) {
                if (mounted) setIsTarget(false)
                return
            }

            // If it's the supervisor global dashboard (no userId), we always show the real data
            if (!userId && !userEmail) {
                if (mounted) setIsTarget(true)
                return
            }

            // If email matches the fallback target
            if (normalizedEmail === TARGET_MINER_EMAIL) {
                if (mounted) setIsTarget(true)
                return
            }

            // Look up by ID to see if their name is Miner A
            if (userId) {
                try {
                    const { data } = await supabase.from('users').select('full_name, email').eq('id', userId).single()
                    if (data && (
                        data.full_name?.trim().toLowerCase() === TARGET_MINER_NAME.toLowerCase() ||
                        data.email?.toLowerCase() === TARGET_MINER_EMAIL
                    )) {
                        if (mounted) setIsTarget(true)
                        return
                    }
                } catch (e) {
                    console.error("Error checking target miner:", e)
                }
            }

            // For any other case, wait, if the email matches checking again:
            if (normalizedEmail && normalizedEmail.includes('miner')) {
                // If the email has 'miner' in it, and we couldn't match exactly, we'll tentatively allow it
                // But specifically the user asked for "Miner A"
            }

            if (mounted) setIsTarget(false)
        }
        checkTargetMiner()
        return () => { mounted = false }
    }, [userId, normalizedEmail, userEmail, useRealData])

    // Fetch latest sensor data
    useEffect(() => {
        if (!isTarget) {
            setLoading(false)
            return
        }

        const fetchLatestData = async () => {
            try {
                // Fetch latest overall data from the sensor database
                let query = sensorSupabase
                    .from('sensor_data')
                    .select('*')
                    .order('created_at', { ascending: false })
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
                const newMq2 = parseFloat(latest.mq2_analog || latest.mq2) || 0.0
                const newMq9 = parseFloat(latest.mq9_analog || latest.mq9) || 0.0
                const newMq135 = parseFloat(latest.mq135_analog || latest.mq135) || 0.0
                const newTemp = parseFloat(latest.temperature || latest.dht11_temp) || 0.0
                const newHum = parseFloat(latest.humidity || latest.dht11_humidity) || 0.0
                const newAccel = parseFloat(latest.motion_accel || latest.accel) || 0.0
                const newGyro = parseFloat(latest.motion_gyro || latest.gyro) || 0.0
                const newBpm = parseInt(latest.bpm) || 0
                const newSpo2 = parseInt(latest.spo2) || 0
                const newEmergency = latest.emergency || false

                setSensorData({
                    mq2: newMq2,
                    mq9: newMq9,
                    mq135: newMq135,
                    temperature: newTemp,
                    humidity: newHum,
                    accel: newAccel,
                    gyro: newGyro,
                    bpm: newBpm,
                    spo2: newSpo2,
                    emergency: newEmergency,
                    wristbandConnected: latest.wristband_connected || false,
                    airQuality: latest.air_quality || 'Good'
                })

                setSensorHistory(prev => {
                    const newItem = {
                        time: new Date(latest.created_at || latest.timestamp || new Date()),
                        mq2: newMq2,
                        mq9: newMq9,
                        mq135: newMq135,
                        temperature: newTemp,
                        humidity: newHum,
                        accel: newAccel,
                        gyro: newGyro,
                        bpm: newBpm,
                        spo2: newSpo2,
                        emergency: newEmergency
                    }
                    return [...prev, newItem].slice(-40)
                })
            })
            .subscribe()

        return () => {
            sensorSupabase.removeChannel(channel)
        }
    }, [isTarget])

    // Fetch sensor history for charts
    useEffect(() => {
        if (!isTarget) return

        const fetchHistory = async () => {
            try {
                let query = sensorSupabase
                    .from('sensor_data')
                    .select('*')
                    .order('created_at', { ascending: false })
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
    }, [isTarget])

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

