import React from 'react';
import { useNavigate } from 'react-router-dom';

const FooterPageLayout = ({ title, children }) => {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
                <button
                    onClick={() => navigate(-1)}
                    className="mb-6 flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                >
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back
                </button>
                <h1 className="text-3xl font-bold text-gray-900 mb-6">{title}</h1>
                <div className="prose prose-blue max-w-none text-gray-700">
                    {children}
                </div>
            </div>
        </div>
    );
};

export const AboutUs = () => (
    <FooterPageLayout title="About Us & Contact Us">
        <p>SIREN (Sensor based indicator for risk in environmental notification) is a comprehensive safety and workforce management web application designed specifically for miners and firefighters.</p>
        <h3 className="text-xl font-semibold mt-6 mb-2">Contact Us</h3>
        <p>Email: support@siren-safety.com</p>
        <p>Phone: +1 (555) 123-4567</p>
        <p>Address: 123 Safety Way, Innovation Hub, Tech City</p>
    </FooterPageLayout>
);

export const LegalDisclosure = () => (
    <FooterPageLayout title="Legal Disclosure">
        <p>Information required according to legal regulations about company ownership and responsibility.</p>
    </FooterPageLayout>
);

export const PrivacyPolicy = () => (
    <FooterPageLayout title="Privacy Policy">
        <p>This Privacy Policy describes how your personal information is collected, used, and shared when you use the SIREN application.</p>
    </FooterPageLayout>
);

export const TermsConditions = () => (
    <FooterPageLayout title="Terms & Conditions">
        <p>By accessing or using the SIREN application, you agree to be bound by these terms and conditions.</p>
    </FooterPageLayout>
);
