import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function WatchMessageDisplay({ userId }) {
    const [latestMessage, setLatestMessage] = useState(null)

    useEffect(() => {
        if (!userId) return

        // Fetch initial unread message
        fetchLatestMessage()

        // Subscribe to new messages
        const channel = supabase
            .channel(`watch-messages:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${userId}`
                },
                async (payload) => {
                    console.log('New message received:', payload)
                    // Fetch sender details
                    const { data: sender } = await supabase
                        .from('users')
                        .select('full_name, role')
                        .eq('id', payload.new.sender_id)
                        .single()

                    setLatestMessage({
                        ...payload.new,
                        sender_name: sender?.full_name || (sender?.role === 'admin' ? 'Admin' : 'Supervisor')
                    })

                    // Auto-dismiss after 30 seconds if not interacted? 
                    // Better to let user dismiss manually to ensure they saw it.
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId])

    const fetchLatestMessage = async () => {
        try {
            // Get the most recent UNREAD message
            const { data, error } = await supabase
                .from('messages')
                .select(`
                *,
                sender:users!sender_id(full_name, role)
            `)
                .eq('receiver_id', userId)
                .eq('is_read', false)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching latest message:', error)
                return
            }

            if (data) {
                setLatestMessage({
                    ...data,
                    sender_name: data.sender?.full_name || (data.sender?.role === 'admin' ? 'Admin' : 'Supervisor')
                })
            }
        } catch (err) {
            console.error('Error fetching messages:', err)
        }
    }

    const handleDismiss = async () => {
        if (!latestMessage) return

        // Mark as read in DB
        try {
            await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', latestMessage.id)
        } catch (err) {
            console.error('Error marking message as read', err)
        }

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
                                {latestMessage.content}
                            </p>
                            <p className="text-gray-500 text-xs mt-2">
                                {new Date(latestMessage.created_at).toLocaleTimeString()}
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
