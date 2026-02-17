import React from 'react';
import FooterPageLayout from '../components/FooterPageLayout';

const TermsConditions = () => (
    <FooterPageLayout title="Terms & Conditions" showDownload={true}>
        <section>
            <p>These Terms and Conditions govern access to and use of this application, its dashboards, and associated hardware systems.</p>
            <p className="font-bold text-gray-900">By accessing or using the system, you agree to be bound by these Terms. If you do not agree, you must not use the system.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 border-l-4 border-blue-600 pl-4 uppercase tracking-wider text-sm">Purpose of the System</h3>
            <p>This system is developed for academic, research, and controlled deployment purposes, with a focus on environmental safety monitoring in hazardous environments.</p>
            <p>The system is intended to support safety awareness and operational decision-making. It does not replace professional judgment, certified safety equipment, or statutory safety procedures.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">User Roles and Access</h3>
            <p>Access to the system is restricted to authorized users assigned specific roles, including Miner, Supervisor, and Administrator.</p>
            <p>Users are responsible for maintaining the confidentiality of their login credentials and for all activities carried out under their account. Unauthorized access, misuse, or role escalation is strictly prohibited.</p>
        </section>

        <section className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-4 mt-0 uppercase tracking-wider text-sm">Acceptable Use</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h4 className="font-bold text-blue-900 mb-2 underline decoration-blue-200 decoration-2 underline-offset-4">Users agree to:</h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-700 text-sm">
                        <li>Use the system only for its intended safety and monitoring purposes</li>
                        <li>Provide accurate and up-to-date information where required</li>
                        <li>Follow all applicable safety protocols and operational guidelines</li>
                    </ul>
                </div>
                <div>
                    <h4 className="font-bold text-red-900 mb-2 underline decoration-red-200 decoration-2 underline-offset-4">Users must not:</h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-700 text-sm">
                        <li>Attempt to disrupt, damage, or reverse engineer the system</li>
                        <li>Use the system for unlawful, misleading, or malicious activities</li>
                        <li>Interfere with sensor data, alerts, or system logs</li>
                        <li>Share access credentials with unauthorized individuals</li>
                    </ul>
                </div>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Data Accuracy and Responsibility</h3>
            <p>While the system is designed to provide timely safety-related information, sensor readings and alerts may be subject to technical limitations, environmental factors, or connectivity issues.</p>
            <p>Users and deploying organizations are responsible for verifying information and taking appropriate action based on situational awareness and established safety procedures.</p>
        </section>

        <section className="bg-blue-900 text-white p-6 rounded-xl">
            <h3 className="text-xl font-bold mb-3 mt-0 uppercase tracking-wider text-sm">Emergency and Safety Disclaimer</h3>
            <p className="font-medium text-blue-50">The system is intended to assist with safety monitoring and emergency awareness.</p>
            <p className="mb-0">It does not guarantee prevention of accidents, injuries, or hazardous events, and should not be relied upon as the sole means of ensuring safety.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Intellectual Property</h3>
            <p>All software, designs, interfaces, documentation, and related materials associated with the system are the intellectual property of the project owners unless otherwise stated.</p>
            <p>Users are granted a limited, non-transferable, non-exclusive right to use the system for its intended purpose. No part of the system may be copied, modified, or distributed without prior written permission.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">System Availability</h3>
            <p>The system may be updated, modified, suspended, or discontinued at any time for maintenance, research, or operational reasons. No guarantee is provided regarding uptime, uninterrupted access, or continued feature availability.</p>
        </section>

        <section className="border-t border-gray-100 pt-8">
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Limitation of Liability</h3>
            <p className="italic text-gray-600 font-medium">To the maximum extent permitted by applicable law, the project team shall not be liable for any direct, indirect, incidental, or consequential damages arising from the use of or inability to use the system.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm text-red-600">Termination of Access</h3>
            <p>Access to the system may be suspended or terminated without notice if a user violates these Terms or misuses the system. Upon termination, the user must cease all use of the system.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Changes to These Terms</h3>
            <p>These Terms may be updated periodically to reflect system changes or operational requirements. Continued use of the system after updates constitutes acceptance of the revised Terms.</p>
        </section>

        <section className="bg-gray-950 text-white p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold mb-4 mt-0 uppercase tracking-wider text-sm">Contact</h3>
            <p className="text-gray-300">For questions or concerns related to these Terms and Conditions, please contact the project administrators using the contact information provided on this website.</p>
        </section>
    </FooterPageLayout>
);

export default TermsConditions;
