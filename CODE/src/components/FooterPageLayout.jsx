import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from './Logo';

const FooterPageLayout = ({ title, children, showDownload = false }) => {
    const navigate = useNavigate();

    const handleDownloadPDF = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Header matching landing page */}
            <nav className="bg-blue-950 border-b border-blue-900/50 shadow-lg py-4 px-8 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                        <Logo className="h-10 w-auto" />
                        <span className="text-white text-xl font-black tracking-tight">SIREN</span>
                    </Link>
                    <button
                        onClick={() => navigate(-1)}
                        className="text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center space-x-2 border border-white/10"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>Go Back</span>
                    </button>
                </div>
            </nav>

            <main className="flex-1 py-12 px-4">
                <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                    <div className="bg-gray-50 px-8 py-6 border-b border-gray-100 flex justify-between items-center">
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
                        {showDownload && (
                            <button
                                onClick={handleDownloadPDF}
                                className="no-print bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center space-x-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Download PDF</span>
                            </button>
                        )}
                    </div>
                    <div className="p-8 prose prose-blue max-w-none text-gray-700 leading-relaxed space-y-8">
                        {children}
                    </div>
                </div>
            </main>

            {/* Simple local footer for these pages */}
            <footer className="py-8 text-center text-gray-500 text-sm border-t border-gray-200 bg-white">
                <p>© {new Date().getFullYear()} SIREN. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default FooterPageLayout;
