import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Map raw risk_level values from the database to user-friendly display labels.
 * The DB still stores 'critical'/'high'/'medium'/'low' — this is UI-only.
 */
export const RISK_DISPLAY_LABELS = {
    critical: 'Elevated Risk',
    high: 'Predictive Risk',
    medium: 'Monitor',
    low: 'Normal'
}

export function getRiskDisplayLabel(riskLevel) {
    return RISK_DISPLAY_LABELS[riskLevel] || riskLevel
}

/**
 * Hook to fetch and listen to real-time ML predictions
 * @param {string} filterUserId - Optional user ID to filter predictions
 * @param {number} minConfidence - Minimum risk_score (0-1) to include (default 0 = show all)
 */
export function usePredictions(filterUserId = null, minConfidence = 0) {
    const [predictions, setPredictions] = useState([])
    const [latestPrediction, setLatestPrediction] = useState(null)
    const [loading, setLoading] = useState(true)

    // Fetch initial latest predictions
    useEffect(() => {
        let mounted = true

        const fetchPredictions = async () => {
            try {
                let query = supabase
                    .from('ml_predictions')
                    .select('*, users(full_name)')
                    .order('created_at', { ascending: false })
                    .limit(50) // Get the latest 50

                if (filterUserId) {
                    query = query.eq('miner_id', filterUserId)
                }

                if (minConfidence > 0) {
                    query = query.gte('risk_score', minConfidence)
                }

                const { data, error } = await query

                if (error) {
                    console.error('Error fetching predictions:', error)
                } else if (data && mounted) {
                    setPredictions(data)
                    if (data.length > 0) {
                        setLatestPrediction(data[0])
                    }
                }
            } catch (error) {
                console.error('Error in fetchPredictions:', error)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        fetchPredictions()

        return () => { mounted = false }
    }, [filterUserId, minConfidence])

    // Subscription for real-time inserts
    useEffect(() => {
        const channelName = filterUserId 
            ? `predictions-user-${filterUserId}` 
            : 'predictions-all'

        let filterString = `event=INSERT,schema=public,table=ml_predictions`
        if (filterUserId) {
             filterString += `,filter=miner_id=eq.${filterUserId}`
        }

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'ml_predictions',
                ...(filterUserId ? { filter: `miner_id=eq.${filterUserId}` } : {})
            }, async (payload) => {
                const newPrediction = payload.new

                // Skip low-confidence predictions in realtime too
                if (minConfidence > 0 && newPrediction.risk_score < minConfidence) {
                    return
                }

                // We need to fetch the user's name separately since realtime 
                // payloads don't automatically join tables
                let fullName = 'Unknown Miner'
                if (newPrediction.miner_id) {
                    try {
                        const { data } = await supabase
                            .from('users')
                            .select('full_name')
                            .eq('id', newPrediction.miner_id)
                            .single()
                        if (data) fullName = data.full_name
                    } catch(e) { /* ignore */ }
                }

                const predictionWithUser = {
                    ...newPrediction,
                    users: { full_name: fullName }
                }

                setPredictions(prev => [predictionWithUser, ...prev].slice(0, 50))
                setLatestPrediction(predictionWithUser)
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [filterUserId, minConfidence])

    return {
        predictions,
        latestPrediction,
        loading
    }
}

