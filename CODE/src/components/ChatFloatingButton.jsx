import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function ChatFloatingButton({ currentUser, onActivityLog }) {
    const [isOpen, setIsOpen] = useState(false)
    const [miners, setMiners] = useState([])
    const [selectedMiner, setSelectedMiner] = useState(null)
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(false)
    const [senderRole, setSenderRole] = useState('miner') // fetched from users table
    const [hoveredMsgId, setHoveredMsgId] = useState(null)
    const [deletingId, setDeletingId] = useState(null)

    // ── Multi-select state (admin only) ──────────────────────────────────────
    const [selectMode, setSelectMode] = useState(false)
    const [selectedMsgIds, setSelectedMsgIds] = useState(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const messagesEndRef = useRef(null)

    const isAdmin = senderRole === 'admin'
    const someSelected = selectedMsgIds.size > 0
    const allSelected = messages.length > 0 && messages.every(m => selectedMsgIds.has(m.id))

    // Exit select mode when miner changes or panel closes
    const exitSelectMode = () => {
        setSelectMode(false)
        setSelectedMsgIds(new Set())
    }

    const toggleSelectMode = () => {
        if (selectMode) {
            exitSelectMode()
        } else {
            setSelectMode(true)
            setSelectedMsgIds(new Set())
        }
    }

    const toggleSelectOne = (id) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedMsgIds(new Set())
        } else {
            setSelectedMsgIds(new Set(messages.map(m => m.id)))
        }
    }

    // ── Fetch sender role ─────────────────────────────────────────────────────
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

    // ── Fetch miners ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) fetchMiners()
    }, [isOpen])

    // ── Fetch messages + subscribe when miner selected ────────────────────────
    useEffect(() => {
        if (selectedMiner) {
            exitSelectMode()
            fetchMessages(selectedMiner.id)
            subscribeToMessages(selectedMiner.id)
        }
        return () => { supabase.removeAllChannels() }
    }, [selectedMiner])

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!selectMode) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, selectMode])

    // ── Data functions ────────────────────────────────────────────────────────
    const fetchMiners = async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, full_name, email, role')
                .eq('role', 'miner')
                .order('full_name')
            if (error) throw error
            setMiners(data || [])
        } catch (error) {
            console.error('Error fetching miners:', error)
        }
    }

    const fetchMessages = async (minerId) => {
        try {
            const { data, error } = await supabase
                .from('chat_messages')
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
        const channel = supabase
            .channel(`chat:${currentUser.id}:${minerId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `user_id=eq.${minerId}`
            }, (payload) => {
                if (payload.new.sender_role === 'miner') {
                    setMessages(prev => [...prev, payload.new])
                }
            })
            .subscribe()
        return channel
    }

    // ── Single delete (hover trash icon) ─────────────────────────────────────
    const handleDeleteMessage = async (msgId) => {
        if (!window.confirm('Delete this message?')) return
        setDeletingId(msgId)
        try {
            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', msgId)
            if (error) throw error
            setMessages(prev => prev.filter(m => m.id !== msgId))
            // Log to admin activity
            onActivityLog?.(
                { id: selectedMiner?.id, full_name: selectedMiner?.full_name || selectedMiner?.email || 'Unknown Miner' },
                'DELETE_MESSAGE',
                `Deleted 1 chat message from conversation with ${selectedMiner?.full_name || selectedMiner?.email || 'miner'}`
            )
        } catch (err) {
            console.error('Error deleting message:', err)
            alert('Failed to delete message: ' + err.message)
        } finally {
            setDeletingId(null)
        }
    }

    // ── Bulk delete ───────────────────────────────────────────────────────────
    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedMsgIds.size} selected message(s)? This cannot be undone.`)) return
        setBulkDeleting(true)
        try {
            const ids = [...selectedMsgIds]
            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .in('id', ids)
            if (error) throw error
            setMessages(prev => prev.filter(m => !ids.includes(m.id)))
            // Log to admin activity
            onActivityLog?.(
                { id: selectedMiner?.id, full_name: selectedMiner?.full_name || selectedMiner?.email || 'Unknown Miner' },
                'BULK_DELETE_MESSAGES',
                `Bulk-deleted ${ids.length} chat message${ids.length !== 1 ? 's' : ''} from conversation with ${selectedMiner?.full_name || selectedMiner?.email || 'miner'}`
            )
            exitSelectMode()
        } catch (err) {
            console.error('Error bulk deleting messages:', err)
            alert('Failed to delete messages: ' + err.message)
        } finally {
            setBulkDeleting(false)
        }
    }

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSendMessage = async (e) => {
        e.preventDefault()
        if (!message.trim() || !selectedMiner) return

        setLoading(true)
        try {
            const newMessage = {
                user_id: selectedMiner.id,
                sender_role: senderRole,
                message_text: message.trim(),
                delivery_status: 'sent'
            }

            const { data, error } = await supabase
                .from('chat_messages')
                .insert(newMessage)
                .select()
                .single()

            if (error) {
                console.error('Supabase insert error:', error)
                alert(`Error saving message: ${error?.message || JSON.stringify(error)}`)
                setLoading(false)
                return
            }

            let apiSuccess = false
            try {
                const centralNodeUrl = process.env.REACT_APP_CENTRAL_NODE_URL || 'http://192.168.1.100'
                await fetch(`${centralNodeUrl}/send`, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ miner_id: selectedMiner.id, message: message.trim() }),
                })
                apiSuccess = true
                console.log('[SIREN] Message packet sent to central node.')
            } catch (apiError) {
                console.error('[SIREN] Error sending packet to central node:', apiError)
                console.warn('[SIREN] Central node unreachable — message saved to DB only.')
            }

            setMessages(prev => [...prev, { ...data, api_success: apiSuccess }])
            setMessage('')
        } catch (error) {
            console.error('Error sending message:', error)
            alert(`Error saving message: ${error?.message || JSON.stringify(error)}`)
        } finally {
            setLoading(false)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
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

                    {/* Panel header */}
                    <div className="p-4 border-b border-gray-200 bg-blue-600 text-white flex justify-between items-center flex-shrink-0">
                        <h3 className="font-bold">Miner Communication</h3>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedMiner ? (
                            <>
                                {/* Chat sub-header with miner name + Select toggle */}
                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => { setSelectedMiner(null); exitSelectMode() }}
                                            className="text-gray-500 hover:text-gray-700"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                        <span className="font-medium text-gray-800 text-sm">
                                            {selectedMiner.full_name || selectedMiner.email}
                                        </span>
                                    </div>

                                    {/* Admin-only: Select mode toggle */}
                                    {isAdmin && messages.length > 0 && (
                                        <button
                                            onClick={toggleSelectMode}
                                            className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${selectMode
                                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                                }`}
                                        >
                                            {selectMode ? 'Cancel' : 'Select'}
                                        </button>
                                    )}
                                </div>

                                {/* Select-all bar (shown in select mode) */}
                                {selectMode && (
                                    <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2 flex-shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                        />
                                        <span className="text-xs font-medium text-blue-700">
                                            {someSelected
                                                ? `${selectedMsgIds.size} of ${messages.length} selected`
                                                : 'Select all'}
                                        </span>
                                    </div>
                                )}

                                {/* Messages area */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                                    {messages.length === 0 ? (
                                        <div className="text-center text-gray-400 text-sm mt-10">
                                            No messages yet. Send a message to start conversation.
                                        </div>
                                    ) : (
                                        messages.map(msg => {
                                            const isMine = msg.sender_role !== 'miner'
                                            const isHovered = hoveredMsgId === msg.id
                                            const isDeleting = deletingId === msg.id
                                            const isChecked = selectedMsgIds.has(msg.id)

                                            return (
                                                <div
                                                    key={msg.id}
                                                    className={`flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                                                    onMouseEnter={() => { if (!selectMode) setHoveredMsgId(msg.id) }}
                                                    onMouseLeave={() => setHoveredMsgId(null)}
                                                >
                                                    {/* Checkbox in select mode (left for received, right for sent) */}
                                                    {selectMode && !isMine && (
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleSelectOne(msg.id)}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0 mb-1"
                                                        />
                                                    )}

                                                    {/* Single-delete trash (hover, non-select mode, admin only) */}
                                                    {!selectMode && isAdmin && isMine && (
                                                        <button
                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                            disabled={isDeleting}
                                                            title="Delete message"
                                                            className={`flex-shrink-0 order-first transition-all duration-150 ${isHovered && !isDeleting
                                                                ? 'opacity-100 scale-100'
                                                                : 'opacity-0 scale-75 pointer-events-none'
                                                                }`}
                                                        >
                                                            {isDeleting ? (
                                                                <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-4 h-4 text-red-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}

                                                    {/* Message bubble */}
                                                    <div
                                                        onClick={() => selectMode && toggleSelectOne(msg.id)}
                                                        className={`max-w-[75%] px-3 py-2 rounded-lg text-sm transition-all ${isMine ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-800'
                                                            } ${selectMode ? 'cursor-pointer' : ''} ${isChecked ? 'ring-2 ring-blue-400 ring-offset-1' : ''
                                                            }`}
                                                    >
                                                        {msg.message_text}
                                                        <div className="flex items-center justify-end space-x-1 mt-1 text-right text-xs opacity-60">
                                                            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {isMine && (
                                                                <span className="ml-1" title={
                                                                    msg.api_success === false ? 'Failed to send to watch'
                                                                        : msg.delivery_status === 'read' ? 'Read' : 'Sent to watch'
                                                                }>
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

                                                    {/* Checkbox on right for sent messages */}
                                                    {selectMode && isMine && (
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleSelectOne(msg.id)}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0 mb-1"
                                                        />
                                                    )}

                                                    {/* Single-delete trash for received messages */}
                                                    {!selectMode && isAdmin && !isMine && (
                                                        <button
                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                            disabled={isDeleting}
                                                            title="Delete message"
                                                            className={`flex-shrink-0 order-last transition-all duration-150 ${isHovered && !isDeleting
                                                                ? 'opacity-100 scale-100'
                                                                : 'opacity-0 scale-75 pointer-events-none'
                                                                }`}
                                                        >
                                                            {isDeleting ? (
                                                                <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-4 h-4 text-red-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Bulk delete bar OR send form */}
                                {selectMode ? (
                                    <div className="p-3 border-t border-gray-200 bg-red-50 flex items-center justify-between flex-shrink-0">
                                        <span className="text-sm text-gray-600">
                                            {someSelected ? `${selectedMsgIds.size} selected` : 'Tap messages to select'}
                                        </span>
                                        <button
                                            onClick={handleBulkDelete}
                                            disabled={!someSelected || bulkDeleting}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-40 transition-colors"
                                        >
                                            {bulkDeleting ? (
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            )}
                                            Delete
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
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
                                )}
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
