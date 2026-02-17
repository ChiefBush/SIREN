import React from 'react';
import FooterPageLayout from '../components/FooterPageLayout';
import d1 from '../images/d1.png';
import d2 from '../images/d2.png';
import d3 from '../images/d3.png';
import d4 from '../images/d4.png';
import m1 from '../images/m1.png';
import m2 from '../images/m2.png';
import m3 from '../images/m3.png';

const AboutUs = () => {
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

export default AboutUs;
