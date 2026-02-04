import React from 'react'
import logoPng from '../SIREN-LOGO.png'

const Logo = ({ className = "h-12" }) => {
    return (
        <div className={`flex items-center ${className}`}>
            <img
                src={logoPng}
                alt="SIREN Logo"
                className="h-full w-auto object-contain"
            />
        </div>
    )
}

export default Logo
