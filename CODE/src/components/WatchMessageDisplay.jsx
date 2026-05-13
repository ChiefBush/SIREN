import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function WatchMessageDisplay({ userId }) {
    const [latestMessage, setLatestMessage] = useState(null)
    // Use a ref for dismissed IDs so it doesn't trigger re-subscriptions
    const dismissedIdsRef = useRef(new Set())

    const fetchLatestMessage = useCallback(async () => {
        if (!userId) return
        try {
            // Get the most recent UNREAD message (delivery_status = 'sent')
            // Messages marked as 'read' will NOT appear here
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('user_id', userId)
                .neq('sender_role', 'miner')
                .eq('delivery_status', 'sent')
                .order('timestamp', { ascending: false })
                .limit(1)
                .single()

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching latest message:', error)
                return
            }

            if (data && !dismissedIdsRef.current.has(data.id)) {
                setLatestMessage({
                    ...data,
                    sender_name: data.sender_role === 'admin' ? 'Admin' : 'Supervisor'
                })
            } else if (!data) {
                // No unread messages found
                setLatestMessage(null)
            }
        } catch (err) {
            console.error('Error fetching messages:', err)
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return

        // Fetch initial unread message
        fetchLatestMessage()

        // Subscribe to new messages - listen for INSERTS on chat_messages table
        const channel = supabase
            .channel(`watch-messages:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages'
                },
                (payload) => {
                    const newMsg = payload.new
                    // Only process messages for this user, sent by supervisor/admin
                    if (newMsg.user_id !== userId) return
                    if (newMsg.sender_role === 'miner') return
                    if (dismissedIdsRef.current.has(newMsg.id)) return

                    console.log('[WatchMessageDisplay] New message received:', newMsg)

                    setLatestMessage({
                        ...newMsg,
                        sender_name: newMsg.sender_role === 'admin' ? 'Admin' : 'Supervisor'
                    })
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'chat_messages'
                },
                (payload) => {
                    const updatedMsg = payload.new
                    // Clear latest message if it was marked as read
                    if (updatedMsg.delivery_status === 'read') {
                        setLatestMessage(prev => {
                            if (prev && prev.id === updatedMsg.id) return null
                            return prev
                        })
                    }
                }
            )
            .subscribe((status) => {
                console.log('[WatchMessageDisplay] Subscription status:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId, fetchLatestMessage])

    const handleDismiss = async () => {
        if (!latestMessage) return

        const messageId = latestMessage.id

        // Optimistically dismiss from UI immediately
        dismissedIdsRef.current.add(messageId)
        setLatestMessage(null)

        // Mark as read in DB — this is the persistent change that survives reload
        try {
            const { error } = await supabase
                .from('chat_messages')
                .update({ delivery_status: 'read' })
                .eq('id', messageId)

            if (error) {
                console.error('[WatchMessageDisplay] Failed to mark message as read:', error)
                // Revert: remove from dismissed so it can show again
                dismissedIdsRef.current.delete(messageId)
                // Re-fetch to show it again since the DB update failed
                fetchLatestMessage()
            } else {
                console.log('[WatchMessageDisplay] Message', messageId, 'marked as read successfully')
            }
        } catch (err) {
            console.error('[WatchMessageDisplay] Error marking message as read:', err)
            dismissedIdsRef.current.delete(messageId)
            fetchLatestMessage()
        }
    }

    if (!latestMessage) return null

    return (
        <div className="fixed top-4 left-4 right-4 z-[100] animate-in slide-in-from-top-2 duration-300">
            <div className="bg-white border-l-4 border-blue-600 rounded-lg shadow-2xl overflow-hidden max-w-sm mx-auto">
                <div className="p-4 relative">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mb-1">
                                Message from {latestMessage.sender_name}
                            </span>
                            <p className="text-gray-900 text-lg font-bold leading-snug">
                                {latestMessage.message_text}
                            </p>
                            <p className="text-gray-500 text-xs mt-2">
                                {new Date(latestMessage.timestamp).toLocaleTimeString()}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleDismiss}
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                    >
                        Acknowledge
                    </button>
                </div>
            </div>
        </div>
    )
}
