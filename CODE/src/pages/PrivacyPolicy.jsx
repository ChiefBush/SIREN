import React from 'react';
import FooterPageLayout from '../components/FooterPageLayout';

const PrivacyPolicy = () => (
    <FooterPageLayout title="Privacy Policy" showDownload={true}>
        <section>
            <p>This Privacy Policy explains how data is collected, used, stored, and protected when using this application and its associated hardware system.</p>
            <p>By accessing or using the system, you acknowledge and agree to the practices described in this policy.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 border-l-4 border-blue-600 pl-4 uppercase tracking-wider text-sm">Scope</h3>
            <p>This system is developed for academic, research, and controlled deployment purposes, with a focus on environmental safety monitoring in hazardous environments. This policy applies to all data processed through the application, dashboards, and connected devices.</p>
        </section>

        <section className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-3 mt-0 uppercase tracking-wider text-sm">Data Collected</h3>

            <div className="space-y-4">
                <div>
                    <h4 className="font-bold text-blue-900 mb-2">Operational and Technical Data</h4>
                    <p className="text-sm mb-2 text-gray-600">The system collects data required for safety monitoring and functionality, including:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                        <li>Environmental sensor readings (gas levels, temperature, humidity)</li>
                        <li>Device identifiers and system-generated IDs</li>
                        <li>Timestamps, logs, and alert events</li>
                        <li>Signal strength and communication metrics</li>
                        <li>System health and diagnostic data</li>
                    </ul>
                </div>

                <div className="pt-4 border-t border-blue-100">
                    <h4 className="font-bold text-blue-900 mb-2">Personal Data</h4>
                    <p className="text-sm mb-2 text-gray-600">Strictly for identification and emergency response purposes:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                        <li>Full name and email address</li>
                        <li>Employee or role identifier</li>
                        <li>Emergency contact numbers</li>
                        <li>Blood type (for emergency use only)</li>
                    </ul>
                </div>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Purpose of Data Processing</h3>
            <p>Data is processed strictly for safety-related objectives, including monitoring environmental conditions, generating notifications, supporting predictive risk analysis, and academic research. Data is not used for advertising or unrelated secondary purposes.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Sensitive Data Handling</h3>
            <div className="bg-blue-900 text-white p-6 rounded-xl">
                <p className="mt-0 font-medium">Health-related information, such as blood type, is collected solely for emergency response purposes. Such data is handled with additional care, restricted access, and is not shared beyond authorized personnel.</p>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Data Storage and Security</h3>
            <p>Reasonable technical and organizational measures are implemented to protect data stored locally and on cloud infrastructure. However, no method of storage or transmission can guarantee absolute security.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Data Sharing and Disclosure</h3>
            <p>Collected data is not sold or shared for commercial purposes. Disclosure occurs only to authorized operators, for academic evaluation, or when required by law.</p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">User Rights</h3>
                <ul className="list-disc list-inside space-y-1">
                    <li>Access associated data</li>
                    <li>Correction of inaccuracies</li>
                    <li>Deletion of personal data</li>
                    <li>Withdrawal of consent</li>
                </ul>
            </div>
            <div>

            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Third-Party Services</h3>
            <p>Integrated platforms for storage or analytics operate under their own privacy policies. The project team is not responsible for independent practices of third parties.</p>
        </section>

        <section className="bg-blue-950 text-white p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold mb-4 mt-0">Privacy Contact</h3>
            <p className="text-gray-300">For questions, concerns, or requests related to this Privacy Policy or data handling practices, please contact the project administrators.</p>
        </section>
    </FooterPageLayout>
);

export default PrivacyPolicy;
