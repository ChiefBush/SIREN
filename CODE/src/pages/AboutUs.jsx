import React, { useState } from 'react';
import emailjs from '@emailjs/browser';
import FooterPageLayout from '../components/FooterPageLayout';
import d1 from '../images/d1.png';
import d2 from '../images/d2.png';
import d3 from '../images/d3.png';
import d4 from '../images/d4.png';
import m1 from '../images/m1.png';
import m2 from '../images/m2.png';
import m3 from '../images/m3.png';

const AboutUs = () => {
    const [formData, setFormData] = useState({
        from_name: '',
        reply_to: '',
        message: ''
    });
    const [submitStatus, setSubmitStatus] = useState('idle'); // idle, sending, success, error

    const handleFormChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleContactSubmit = async (e) => {
        e.preventDefault();
        setSubmitStatus('sending');

        const { from_name, reply_to, message } = formData;

        const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
        const templateId = process.env.REACT_APP_EMAILJS_TEMPLATE_ID;
        const publicKey = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

        if (!serviceId || !templateId || !publicKey) {
            console.error('EmailJS environment variables are missing.');
            setSubmitStatus('error');
            return;
        }

        const templateParams = {
            title: from_name,
            name: from_name,
            from_name: from_name,
            reply_to: reply_to,
            message: message
        };

        try {
            await emailjs.send(
                serviceId,
                templateId,
                templateParams,
                publicKey
            );

            setSubmitStatus('success');
            setFormData({ from_name: '', reply_to: '', message: '' });
        } catch (error) {
            console.error('EmailJS Submission error:', error);
            setSubmitStatus('error');
        }
    };
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
                        <TeamMember name="Arul Gupta" role="Lead Systems" image={d1} />
                        <TeamMember name="Ishita Dham" role="Frontend Architect" image={d2} />
                        <TeamMember name="Ishita Dhiman" role="Backend Specialist" image={d3} />
                        <TeamMember name="Shishir Dwivedi" role="IoT Integration" image={d4} />
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
                        <TeamMember name="Dr. Nitasha Hasteer" role="Project Supervisor" image={m1} />
                        <TeamMember name="Dr. Sanjay Sinha" role="Technical Guide" image={m2} />
                        <TeamMember name="Dr. Kamlesh Pandey" role="Research Director" image={m3} />
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
                <section className="bg-blue-950 text-white p-10 rounded-[32px] shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-20 bg-blue-600/10 blur-[100px] rounded-full"></div>

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div>
                            <h2 className="text-4xl font-black mb-8">Contact Us</h2>
                            <div className="space-y-6">
                                <div>
                                    <p className="text-blue-400 uppercase tracking-widest text-xs font-black mb-2">Technical Support</p>
                                    <p className="text-xl">caneriesiren@gmail.com</p>
                                </div>
                                <div>
                                    <p className="text-blue-400 uppercase tracking-widest text-xs font-black mb-2">Connect with the Project Team</p>
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-base font-normal text-gray-200">+91 99991 00439</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-lg text-gray-400 mb-6">Send a message to the development team:</p>
                            <form className="space-y-4" onSubmit={handleContactSubmit}>
                                {submitStatus === 'success' ? (
                                    <div className="bg-green-500/20 border border-green-500/50 p-6 rounded-2xl text-center">
                                        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <h4 className="text-xl font-bold mb-2">Message Sent!</h4>
                                        <p className="text-sm text-gray-300">Thank you for reaching out. We will get back to you soon.</p>
                                        <button
                                            type="button"
                                            onClick={() => setSubmitStatus('idle')}
                                            className="mt-4 text-sm text-blue-400 font-bold hover:underline"
                                        >
                                            Send another message
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <input
                                                type="text"
                                                name="from_name"
                                                required
                                                placeholder="Your Name"
                                                value={formData.from_name}
                                                onChange={handleFormChange}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                            />
                                            <input
                                                type="email"
                                                name="reply_to"
                                                required
                                                placeholder="Your Email"
                                                value={formData.reply_to}
                                                onChange={handleFormChange}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                            />
                                        </div>
                                        <textarea
                                            name="message"
                                            required
                                            placeholder="How can we help you?"
                                            rows="4"
                                            value={formData.message}
                                            onChange={handleFormChange}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all resize-none"
                                        ></textarea>

                                        {submitStatus === 'error' && (
                                            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                                                <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Configuration Required</p>
                                                <p className="text-red-300 text-[10px] leading-tight opacity-80">
                                                    You need to replace the placeholders in your <b>.env</b> file with actual keys from your EmailJS dashboard,
                                                    then restart the application to enable SMTP sending.
                                                </p>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={submitStatus === 'sending'}
                                            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20 uppercase tracking-widest text-sm flex items-center justify-center space-x-2 ${submitStatus === 'sending' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {submitStatus === 'sending' ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span>Sending...</span>
                                                </>
                                            ) : (
                                                <span>Send Message</span>
                                            )}
                                        </button>
                                    </>
                                )}
                            </form>
                        </div>
                    </div>
                </section>
            </div>
        </FooterPageLayout>
    );
};

export default AboutUs;
