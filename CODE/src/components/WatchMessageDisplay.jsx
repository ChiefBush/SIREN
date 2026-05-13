import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function WatchMessageDisplay({ userId }) {
    const [latestMessage, setLatestMessage] = useState(null)
    const [dismissedIds, setDismissedIds] = useState(new Set())

    const fetchLatestMessage = useCallback(async () => {
        if (!userId) return
        try {
            // Get the most recent UNREAD message
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

            if (data && !dismissedIds.has(data.id)) {
                setLatestMessage({
                    ...data,
                    sender_name: data.sender_role === 'admin' ? 'Admin' : 'Supervisor'
                })
            }
        } catch (err) {
            console.error('Error fetching messages:', err)
        }
    }, [userId, dismissedIds])

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
                async (payload) => {
                    const newMsg = payload.new
                    // Only process messages for this user, sent by supervisor/admin
                    if (newMsg.user_id !== userId) return
                    if (newMsg.sender_role === 'miner') return
                    if (dismissedIds.has(newMsg.id)) return

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
                async (payload) => {
                    const updatedMsg = payload.new
                    // Clear latest message if it was marked as read
                    if (latestMessage && updatedMsg.id === latestMessage.id && updatedMsg.delivery_status === 'read') {
                        setLatestMessage(null)
                    }
                }
            )
            .subscribe((status) => {
                console.log('[WatchMessageDisplay] Subscription status:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId, dismissedIds, fetchLatestMessage, latestMessage])

    const handleDismiss = async () => {
        if (!latestMessage) return

        const messageId = latestMessage.id

        // Mark as read in DB
        try {
            await supabase
                .from('chat_messages')
                .update({ delivery_status: 'read' })
                .eq('id', messageId)
        } catch (err) {
            console.error('Error marking message as read', err)
        }

        // Track dismissed ID so it never reappears in this session
        setDismissedIds(prev => new Set(prev).add(messageId))
        setLatestMessage(null)
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
