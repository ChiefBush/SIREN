import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook to fetch and listen to real-time ML predictions
 * @param {string} filterUserId - Optional user ID to filter predictions
 */
export function usePredictions(filterUserId = null) {
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
    }, [filterUserId])

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
    }, [filterUserId])

    return {
        predictions,
        latestPrediction,
        loading
    }
}
