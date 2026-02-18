import React from 'react';
import FooterPageLayout from '../components/FooterPageLayout';

const LegalDisclosure = () => (
    <FooterPageLayout title="Legal Disclosure" showDownload={true}>
        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 border-l-4 border-blue-600 pl-4 uppercase tracking-wider text-sm">General Information</h3>
            <p>This application and associated hardware system are developed as part of an academic and research project focused on improving safety awareness in hazardous work environments.</p>
            <p>The system is intended for demonstration, evaluation, and research purposes only unless explicitly deployed under controlled and approved conditions.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 border-l-4 border-blue-600 pl-4 uppercase tracking-wider text-sm">No Warranty or Guarantee</h3>
            <p className="font-medium text-gray-800">The system is provided on an “as-is” basis.</p>
            <p>While reasonable efforts have been made to ensure accuracy, reliability, and functional integrity, no guarantees are made regarding the completeness, accuracy, or uninterrupted operation of the application, hardware, or associated services.</p>
            <p>The developers make no warranties, express or implied, including but not limited to fitness for a particular purpose or non-infringement.</p>
        </section>

        <section className="bg-red-50 p-6 rounded-xl border border-red-100">
            <h3 className="text-xl font-bold text-red-900 mb-3 mt-0 uppercase tracking-wider text-sm">Limitation of Liability</h3>
            <p className="text-red-900 font-medium">The developers, contributors, and affiliated institutions shall not be held liable for any direct, indirect, incidental, consequential, or special damages arising out of the use or inability to use this system.</p>
            <p className="mb-2">This includes, but is not limited to:</p>
            <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>Personal injury</li>
                <li>Property damage</li>
                <li>Operational losses</li>
                <li>Data loss or corruption</li>
                <li>Delayed or missed alerts</li>
            </ul>
            <p className="mt-4 font-bold text-red-950">Use of the system is entirely at the user’s own risk.</p>
        </section>

        <section className="border-t border-gray-100 pt-8">
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Safety Disclaimer</h3>
            <p className="font-bold text-blue-900">This system is designed to assist in monitoring environmental conditions and issuing alerts. It does not replace mandatory safety protocols, certified safety equipment, professional supervision, or regulatory compliance requirements.</p>
            <p>Users must continue to follow all applicable workplace safety rules, training procedures, and emergency response guidelines.</p>
            <p className="italic">The system should not be relied upon as the sole safety mechanism in any hazardous environment.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Data Accuracy and Interpretation</h3>
            <p>Sensor readings, alerts, and predictive outputs are based on electronic measurements and algorithmic analysis, which may be affected by environmental factors, sensor limitations, calibration drift, or connectivity constraints.</p>
            <p>Predictions and alerts are advisory in nature and should be interpreted as decision-support signals, not absolute determinations of safety or danger.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Data Handling and Privacy</h3>
            <p>Environmental and device-related data collected by the system may be stored, processed, and transmitted for monitoring, analysis, and research purposes.</p>
            <p>No personal data is intentionally collected unless explicitly stated and consented to by the user or deploying organization.</p>
            <p>All reasonable measures are taken to secure stored data; however, absolute data security cannot be guaranteed.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Third-Party Services</h3>
            <p>The system may integrate third-party platforms, libraries, or cloud services for data storage, visualization, or communication.</p>
            <p>The developers are not responsible for the availability, accuracy, or policies of any third-party services used within the system.</p>
            <p>Use of such services is subject to their respective terms and conditions.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Intellectual Property</h3>
            <p>All original source code, system architecture, documentation, and design elements are the intellectual property of the project authors unless otherwise stated. Unauthorized copying, redistribution, or commercial use without prior permission is prohibited.</p>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Changes to This Disclosure</h3>
            <p>This legal disclosure may be updated or modified at any time without prior notice to reflect changes in functionality, scope, or regulatory considerations. Continued use of the application after updates constitutes acceptance of the revised disclosure.</p>
        </section>

        <section className="bg-blue-950 text-white p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold mb-4 mt-0">Contact</h3>
            <p className="text-gray-300">For questions related to legal, compliance, or usage concerns, please contact the project administrators through the official communication channels provided on this website.</p>
        </section>
    </FooterPageLayout>
);

export default LegalDisclosure;
