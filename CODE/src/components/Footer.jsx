import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer className="bg-white border-t border-gray-200 h-20 flex items-center px-8 mt-auto">
            <div className="flex-1 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
                <div className="text-sm text-gray-500">
                    © {new Date().getFullYear()} SIREN. All rights reserved.
                </div>
                <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-gray-600">
                    <Link to="/about" className="hover:text-blue-600 transition-colors">About Us</Link>
                    <Link to="/legal" className="hover:text-blue-600 transition-colors">Legal Disclosure</Link>
                    <Link to="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
                    <Link to="/terms" className="hover:text-blue-600 transition-colors">Terms & Conditions</Link>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
