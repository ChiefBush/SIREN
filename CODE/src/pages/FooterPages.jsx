import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from '../components/Logo';
import d1 from '../images/d1.png';
import d2 from '../images/d2.png';
import d3 from '../images/d3.png';
import d4 from '../images/d4.png';
import m1 from '../images/m1.png';
import m2 from '../images/m2.png';
import m3 from '../images/m3.png';

const FooterPageLayout = ({ title, children }) => {
    const navigate = useNavigate();
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
                    <div className="bg-gray-50 px-8 py-6 border-b border-gray-100">
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
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


export const AboutUs = () => {
    const TeamMember = ({ name, role, image }) => (
        <div className="flex flex-col items-center p-4 bg-white rounded-2xl shadow-sm border border-gray-50 hover:shadow-md transition-shadow group">
            <div className="w-32 h-32 rounded-3xl mb-4 overflow-hidden border-2 border-transparent group-hover:border-blue-200 transition-all">
                <img
                    src={image}
                    alt={name}
                    className="w-full h-full object-cover"
                />
            </div>
            <h4 className="font-bold text-gray-900 mb-1">{name}</h4>
            <p className="text-sm text-gray-500 text-center">{role}</p>
        </div>
    );

    return (
        <FooterPageLayout title="About Us">
            <section className="text-center max-w-3xl mx-auto mb-16">
                <p className="text-xl text-gray-600 leading-relaxed font-medium">
                    This project brings together academic research and hands-on engineering to address real-world safety challenges using connected devices, data analytics, and intelligent alerting.
                </p>
            </section>

            <div className="space-y-24">
                {/* Developers Section */}
                <section>
                    <div className="flex items-center space-x-4 mb-12">
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Our Team</h2>
                        <div className="h-px flex-1 bg-gray-100"></div>
                        <span className="text-blue-600 font-bold uppercase tracking-widest text-xs">Developers</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                        <TeamMember name="Developer 1" role="Lead Systems" image={d1} />
                        <TeamMember name="Developer 2" role="Frontend Architect" image={d2} />
                        <TeamMember name="Developer 3" role="Backend Specialist" image={d3} />
                        <TeamMember name="Developer 4" role="IoT Integration" image={d4} />
                    </div>

                    <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100">
                        <p className="text-gray-700 font-medium mb-4">A team of four developers responsible for the core design and implementation of the system. Their work includes:</p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
                            {[
                                "System architecture and implementation",
                                "Hardware and sensor integration",
                                "Backend services and data handling",
                                "Application development and dashboards",
                                "Testing, validation, and documentation"
                            ].map((item, idx) => (
                                <li key={idx} className="flex items-center space-x-3 text-gray-600">
                                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* Mentors Section */}
                <section>
                    <div className="flex items-center space-x-4 mb-12">
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Mentors</h2>
                        <div className="h-px flex-1 bg-gray-100"></div>
                        <span className="text-blue-600 font-bold uppercase tracking-widest text-xs">Academic Oversight</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                        <TeamMember name="Mentor 1" role="Project Supervisor" image={m1} />
                        <TeamMember name="Mentor 2" role="Technical Guide" image={m2} />
                        <TeamMember name="Mentor 3" role="Research Director" image={m3} />
                    </div>

                    <div className="bg-blue-950 text-white p-8 rounded-3xl shadow-xl">
                        <p className="text-blue-200 font-medium mb-6">Three mentors provide academic guidance, technical oversight, and research direction throughout the project lifecycle. Their role includes:</p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                "Project supervision and review",
                                "Technical and methodological guidance",
                                "Research alignment and academic rigor",
                                "Ethical, safety, and compliance considerations"
                            ].map((item, idx) => (
                                <li key={idx} className="flex items-center space-x-3 text-blue-100/80">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* What We're Building Section */}
                <section>
                    <div className="flex items-center space-x-4 mb-12">
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">What We’re Building</h2>
                        <div className="h-px flex-1 bg-gray-100"></div>
                    </div>

                    <div className="prose prose-blue max-w-none text-gray-700 space-y-8">
                        <p className="text-lg">The system focuses on monitoring environmental conditions in hazardous work environments and supporting timely alerts and responses. It is designed with:</p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 not-prose">
                            {[
                                { title: "Safety-First", desc: "Core principles" },
                                { title: "Role-Based", desc: "Access & accountability" },
                                { title: "Responsible", desc: "Data handling" },
                                { title: "Transparent", desc: "Academic reproducibility" }
                            ].map((p, i) => (
                                <div key={i} className="p-4 rounded-xl border border-gray-100 bg-white">
                                    <div className="font-bold text-gray-900">{p.title}</div>
                                    <div className="text-xs text-gray-500">{p.desc}</div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100 text-yellow-900 text-sm italic">
                            This project is developed as part of an academic and research initiative, with controlled deployment and evaluation. The system is intended for learning, experimentation, and demonstration purposes and does not replace certified safety equipment or statutory safety procedures.
                        </div>
                    </div>
                </section>

                {/* Contact Section */}
                <section className="bg-gray-950 text-white p-10 rounded-[32px] shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-20 bg-blue-600/10 blur-[100px] rounded-full"></div>

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div>
                            <h2 className="text-4xl font-black mb-8">Contact Us</h2>
                            <div className="space-y-6">
                                <div>
                                    <p className="text-blue-400 uppercase tracking-widest text-xs font-black mb-2">Email</p>
                                    <p className="text-xl">contact@siren-safety.com</p>
                                </div>
                                <div>
                                    <p className="text-blue-400 uppercase tracking-widest text-xs font-black mb-2">Phone</p>
                                    <p className="text-xl">+1 (555) 987-6543</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-lg text-gray-400 mb-6">Send a message to the developers:</p>
                            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                                <input
                                    type="text"
                                    placeholder="Your Name"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                />
                                <textarea
                                    placeholder="Your Message"
                                    rows="4"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                ></textarea>
                                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98]">
                                    Send Message
                                </button>
                            </form>
                        </div>
                    </div>
                </section>
            </div>
        </FooterPageLayout>
    );
};

export const LegalDisclosure = () => (
    <FooterPageLayout title="Legal Disclosure">
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

        <section className="bg-gray-950 text-white p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold mb-4 mt-0">Contact</h3>
            <p className="text-gray-300">For questions related to legal, compliance, or usage concerns, please contact the project administrators through the official communication channels provided on this website.</p>
        </section>
    </FooterPageLayout>
);

export const PrivacyPolicy = () => (
    <FooterPageLayout title="Privacy Policy">
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
                <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Children’s Data</h3>
                <p>This system is not intended for use by individuals under 18. No data relating to children is knowingly collected.</p>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wider text-sm">Third-Party Services</h3>
            <p>Integrated platforms for storage or analytics operate under their own privacy policies. The project team is not responsible for independent practices of third parties.</p>
        </section>

        <section className="bg-gray-950 text-white p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold mb-4 mt-0">Privacy Contact</h3>
            <p className="text-gray-300">For questions, concerns, or requests related to this Privacy Policy or data handling practices, please contact the project administrators.</p>
        </section>
    </FooterPageLayout>
);

export const TermsConditions = () => (
    <FooterPageLayout title="Terms & Conditions">
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

