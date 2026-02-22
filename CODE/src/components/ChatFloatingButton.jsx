import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function ChatFloatingButton({ currentUser }) {
    const [isOpen, setIsOpen] = useState(false)
    const [miners, setMiners] = useState([])
    const [selectedMiner, setSelectedMiner] = useState(null)
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(false)
    const [senderRole, setSenderRole] = useState('admin') // fetched from users table
    const messagesEndRef = useRef(null)

    // Fetch the sender's actual role from the users profile table
    useEffect(() => {
        const fetchSenderRole = async () => {
            if (!currentUser?.id) return
            try {
                const { data } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', currentUser.id)
                    .single()
                if (data?.role) setSenderRole(data.role)
            } catch (err) {
                console.error('ChatFloatingButton: could not fetch sender role', err)
            }
        }
        fetchSenderRole()
    }, [currentUser?.id])

    // Fetch miners for the list
    useEffect(() => {
        if (isOpen) {
            fetchMiners()
        }
    }, [isOpen])

    // Fetch messages when a miner is selected
    useEffect(() => {
        if (selectedMiner) {
            fetchMessages(selectedMiner.id)
            subscribeToMessages(selectedMiner.id)
        }
        return () => {
            // Cleanup subscription if needed
            supabase.removeAllChannels()
        }
    }, [selectedMiner])

    // Scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const fetchMiners = async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, full_name, email, role')
                .eq('role', 'miner')
                .order('full_name') // Order by name for easier finding

            if (error) throw error
            setMiners(data || [])
        } catch (error) {
            console.error('Error fetching miners:', error)
        }
    }

    const fetchMessages = async (minerId) => {
        try {
            const { data, error } = await supabase
                .from('chat_messages') // The table is actually called chat_messages
                .select('*')
                .eq('user_id', minerId)
                .order('timestamp', { ascending: true })

            if (error) throw error
            setMessages(data || [])
        } catch (error) {
            console.error('Error fetching messages:', error)
        }
    }

    const subscribeToMessages = (minerId) => {
        // Subscribe to new messages for this conversation
        const channel = supabase
            .channel(`chat:${currentUser.id}:${minerId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `user_id=eq.${minerId}`
                },
                (payload) => {
                    // if it's from the miner
                    if (payload.new.sender_role === 'miner') {
                        setMessages(prev => [...prev, payload.new])
                    }
                }
            )
            .subscribe()

        return channel
    }

    const handleSendMessage = async (e) => {
        e.preventDefault()
        if (!message.trim() || !selectedMiner) return

        setLoading(true)
        try {
            const newMessage = {
                user_id: selectedMiner.id,
                sender_role: senderRole, // fetched from users table (e.g. 'admin', 'supervisor')
                message_text: message.trim(),
                delivery_status: 'sent'
            }

            const { data, error } = await supabase
                .from('chat_messages') // The table is actually called chat_messages based on standard app behavior if 'messages' fails
                .insert(newMessage)
                .select()
                .single()

            if (error) {
                console.error("Supabase insert error:", error);
                alert(`Error saving message to database: ${error?.message || error?.details || JSON.stringify(error)}`);
                setLoading(false)
                return;
            }

            let apiSuccess = false;
            // Send packet to the central node (Arduino/ESP32) via HTTP API
            try {
                // Replace with actual central node IP in .env
                const centralNodeUrl = process.env.REACT_APP_CENTRAL_NODE_URL || 'http://192.168.1.100'

                const response = await fetch(`${centralNodeUrl}/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        miner_id: selectedMiner.id,
                        message: message.trim()
                    }),
                })

                if (response.ok) {
                    apiSuccess = true;
                } else {
                    alert(`Failed to send packet to watch. Node responded with status: ${response.status}`);
                }
            } catch (apiError) {
                console.error('Error sending packet to central node:', apiError)
                alert('Connection to Central Node failed. Make sure the Node is online and the IP is correct setup in .env file.');
            }

            // Optimistically update UI
            setMessages(prev => [...prev, { ...data, api_success: apiSuccess }])
            setMessage('')
        } catch (error) {
            console.error('Error sending message:', error)
            alert(`Error saving message to database: ${error?.message || error?.details || JSON.stringify(error)}`);
        } finally {
            setLoading(false)
        }
    }

    // If no user loop logic provided, we assume currentUser is passed from parent

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-50 transition-transform transform hover:scale-105"
                title="Chat with Miner"
            >
                {isOpen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                )}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-44 right-6 w-80 md:w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 flex flex-col h-[500px] overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-blue-600 text-white flex justify-between items-center">
                        <h3 className="font-bold">Miner Communication</h3>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedMiner ? (
                            // Chat View
                            <>
                                <div className="p-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => setSelectedMiner(null)} className="text-gray-500 hover:text-gray-700">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                        <span className="font-medium text-gray-800">{selectedMiner.full_name || selectedMiner.email}</span>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                                    {messages.length === 0 ? (
                                        <div className="text-center text-gray-400 text-sm mt-10">
                                            No messages yet. Send a message to start conversation.
                                        </div>
                                    ) : (
                                        messages.map(msg => {
                                            const isMine = msg.sender_role !== 'miner';
                                            return (
                                                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${isMine ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-800'}`}>
                                                        {msg.message_text}
                                                        <div className="flex items-center justify-end space-x-1 mt-1 text-right text-xs opacity-60">
                                                            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {/* Status Indicator */}
                                                            {isMine && (
                                                                <span className="ml-1" title={msg.api_success === false ? "Failed to send to watch" : msg.delivery_status === 'read' ? "Read" : "Sent to watch"}>
                                                                    {msg.api_success === false ? (
                                                                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                    ) : msg.delivery_status === 'read' ? (
                                                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 bg-gray-50">
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="Type a message..."
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!message.trim() || loading}
                                            className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                        </button>
                                    </div>
                                </form>
                            </>
                        ) : (
                            // Miner List View
                            <div className="flex-1 overflow-y-auto p-2">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Select Miner</div>
                                {miners.length === 0 ? (
                                    <div className="text-center text-gray-400 p-4">No miners found.</div>
                                ) : (
                                    <div className="space-y-1">
                                        {miners.map(miner => (
                                            <button
                                                key={miner.id}
                                                onClick={() => setSelectedMiner(miner)}
                                                className="w-full text-left p-3 hover:bg-gray-50 rounded-lg flex items-center space-x-3 transition-colors"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs">
                                                    {miner.full_name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{miner.full_name || 'Unknown'}</div>
                                                    <div className="text-xs text-gray-500">{miner.email}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
