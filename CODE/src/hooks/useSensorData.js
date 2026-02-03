import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Reusable hook for fetching and managing sensor data
 * @param {string} userId - Optional user ID to filter sensor data
 * @param {boolean} useRealData - Whether to fetch from database or use synthetic data
 */
export function useSensorData(userId = null, useRealData = false) {
    const [sensorData, setSensorData] = useState({
        mq2: 0.0,
        mq9: 0.0,
        mq135: 0.0,
        temperature: 0.0,
        humidity: 0.0,
        accelX: 0.0,
        accelY: 0.0,
        accelZ: 0.0,
        gyroX: 0.0,
        gyroY: 0.0,
        gyroZ: 0.0
    })
    const [sensorHistory, setSensorHistory] = useState([])
    const [loading, setLoading] = useState(true)

    // Fetch latest sensor data
    useEffect(() => {
        if (useRealData) {
            const fetchLatestData = async () => {
                try {
                    let query = supabase
                        .from('sensor_data')
                        .select('*')
                        .order('timestamp', { ascending: false })
                        .limit(1)

                    if (userId) {
                        query = query.eq('user_id', userId)
                    }

                    const { data, error } = await query

                    if (error) {
                        console.error('Error fetching sensor data:', error)
                        generateSyntheticData()
                    } else if (data && data.length > 0) {
                        const latest = data[0]
                        setSensorData({
                            mq2: parseFloat(latest.mq2) || 0.0,
                            mq9: parseFloat(latest.mq9) || 0.0,
                            mq135: parseFloat(latest.mq135) || 0.0,
                            temperature: parseFloat(latest.dht11_temp) || 0.0,
                            humidity: parseFloat(latest.dht11_humidity) || 0.0,
                            accelX: parseFloat(latest.accel_x) || 0.0,
                            accelY: parseFloat(latest.accel_y) || 0.0,
                            accelZ: parseFloat(latest.accel_z) || 0.0,
                            gyroX: parseFloat(latest.gyro_x) || 0.0,
                            gyroY: parseFloat(latest.gyro_y) || 0.0,
                            gyroZ: parseFloat(latest.gyro_z) || 0.0
                        })
                    } else {
                        generateSyntheticData()
                    }
                } catch (error) {
                    console.error('Error in fetchLatestData:', error)
                    generateSyntheticData()
                } finally {
                    setLoading(false)
                }
            }

            fetchLatestData()
        } else {
            generateSyntheticData()
            setLoading(false)
        }
    }, [userId, useRealData])

    // Fetch sensor history for charts
    useEffect(() => {
        if (useRealData) {
            const fetchHistory = async () => {
                try {
                    let query = supabase
                        .from('sensor_data')
                        .select('*')
                        .order('timestamp', { ascending: true })
                        .limit(100)

                    if (userId) {
                        query = query.eq('user_id', userId)
                    }

                    const { data, error } = await query

                    if (error) {
                        console.error('Error fetching sensor history:', error)
                    } else if (data) {
                        setSensorHistory(data.map(item => ({
                            time: new Date(item.timestamp),
                            mq2: parseFloat(item.mq2) || 0,
                            mq9: parseFloat(item.mq9) || 0,
                            mq135: parseFloat(item.mq135) || 0,
                            temperature: parseFloat(item.dht11_temp) || 0,
                            humidity: parseFloat(item.dht11_humidity) || 0,
                            accelX: parseFloat(item.accel_x) || 0,
                            accelY: parseFloat(item.accel_y) || 0,
                            accelZ: parseFloat(item.accel_z) || 0,
                            gyroX: parseFloat(item.gyro_x) || 0,
                            gyroY: parseFloat(item.gyro_y) || 0,
                            gyroZ: parseFloat(item.gyro_z) || 0
                        })))
                    }
                } catch (error) {
                    console.error('Error in fetchHistory:', error)
                }
            }

            fetchHistory()
        } else {
            generateSyntheticHistory()
        }
    }, [userId, useRealData])

    const generateSyntheticData = () => {
        setSensorData({
            mq2: Math.random() * 200,
            mq9: Math.random() * 150,
            mq135: Math.random() * 300,
            temperature: 20 + Math.random() * 15,
            humidity: 40 + Math.random() * 40,
            accelX: -2 + Math.random() * 4,
            accelY: -2 + Math.random() * 4,
            accelZ: 8 + Math.random() * 4,
            gyroX: -200 + Math.random() * 400,
            gyroY: -200 + Math.random() * 400,
            gyroZ: -200 + Math.random() * 400
        })
    }

    const generateSyntheticHistory = () => {
        const now = new Date()
        const history = []
        for (let i = 99; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60000)
            history.push({
                time,
                mq2: 50 + Math.random() * 150,
                mq9: 40 + Math.random() * 110,
                mq135: 60 + Math.random() * 240,
                temperature: 20 + Math.random() * 15,
                humidity: 40 + Math.random() * 40,
                accelX: -2 + Math.random() * 4,
                accelY: -2 + Math.random() * 4,
                accelZ: 8 + Math.random() * 4,
                gyroX: -200 + Math.random() * 400,
                gyroY: -200 + Math.random() * 400,
                gyroZ: -200 + Math.random() * 400
            })
        }
        setSensorHistory(history)
    }

    // Update sensor data periodically (for synthetic data)
    useEffect(() => {
        if (!useRealData) {
            const interval = setInterval(() => {
                generateSyntheticData()
                generateSyntheticHistory()
            }, 5000)

            return () => clearInterval(interval)
        }
    }, [useRealData])

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

