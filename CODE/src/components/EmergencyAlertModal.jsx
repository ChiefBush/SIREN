import { useEffect, useRef } from 'react'

/**
 * EmergencyAlertModal
 * Shows a full-screen popup alert with a looping alarm sound when the miner
 * triple-taps the helmet button (emergency = true in sensor_data).
 *
 * Props:
 *   isOpen   {boolean}  - Whether to show the modal
 *   onDismiss {function} - Called when supervisor/admin acknowledges the alert
 */
function EmergencyAlertModal({ isOpen, onDismiss }) {
    const audioCtxRef = useRef(null)
    const intervalRef = useRef(null)

    // --- Web Audio API alarm sound (no external file needed) ---
    const startAlarm = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            audioCtxRef.current = ctx

            let beepCount = 0

            const playBeep = () => {
                const oscillator = ctx.createOscillator()
                const gainNode = ctx.createGain()

                oscillator.connect(gainNode)
                gainNode.connect(ctx.destination)

                oscillator.type = 'square'

                // Alternate between two frequencies for a classic siren feel
                oscillator.frequency.setValueAtTime(beepCount % 2 === 0 ? 880 : 660, ctx.currentTime)
                gainNode.gain.setValueAtTime(0.35, ctx.currentTime)
                gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

                oscillator.start(ctx.currentTime)
                oscillator.stop(ctx.currentTime + 0.35)

                beepCount++
            }

            // Play immediately then loop every 500ms
            playBeep()
            intervalRef.current = setInterval(playBeep, 500)
        } catch (e) {
            console.warn('Web Audio API not available:', e)
        }
    }

    const stopAlarm = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
        if (audioCtxRef.current) {
            try {
                audioCtxRef.current.close()
            } catch (e) { /* ignore */ }
            audioCtxRef.current = null
        }
    }

    useEffect(() => {
        if (isOpen) {
            startAlarm()
        } else {
            stopAlarm()
        }

        return () => stopAlarm()
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
        >
            {/* Pulsing red glow ring behind card */}
            <div className="relative">
                <div
                    className="absolute inset-0 rounded-3xl animate-ping"
                    style={{ backgroundColor: 'rgba(220,38,38,0.4)', scale: '1.05' }}
                />

                {/* Alert Card */}
                <div className="relative bg-gray-950 border-4 border-red-600 rounded-3xl shadow-2xl p-10 max-w-lg w-full mx-4 text-center">

                    {/* Siren icon with pulse */}
                    <div className="flex justify-center mb-6">
                        <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-red-500/50">
                            <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-4xl font-black text-red-500 tracking-widest uppercase mb-2 animate-pulse">
                        🚨 SOS ALERT
                    </h2>
                    <p className="text-xl font-bold text-white mb-2">
                        EMERGENCY SOS ACTIVE
                    </p>

                    {/* Divider */}
                    <div className="my-4 border-t border-red-600/40" />

                    {/* Detail text */}
                    <p className="text-gray-300 text-base mb-2">
                        The miner's helmet emergency button has been triggered.
                    </p>
                    <p className="text-gray-400 text-sm mb-8">
                        This may indicate a fall, gas hazard, or manual SOS button press.
                        Please verify the miner's safety immediately and dispatch help if needed.
                    </p>

                    {/* Live badge */}
                    <div className="flex items-center justify-center gap-2 mb-8">
                        <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                        <span className="text-red-400 text-xs font-bold uppercase tracking-widest">
                            Live — Response Required
                        </span>
                    </div>

                    {/* Dismiss button */}
                    <button
                        onClick={onDismiss}
                        className="w-full py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-lg font-bold rounded-xl transition-colors shadow-lg shadow-red-900/50"
                    >
                        ✓ Acknowledge &amp; Dismiss Alert
                    </button>

                    <p className="text-gray-600 text-xs mt-3">
                        Dismissing this alert does not cancel the emergency — continue to monitor the situation.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default EmergencyAlertModal
