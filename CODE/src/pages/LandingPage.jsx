import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import Footer from '../components/Footer'

function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-blue-200">
      {/* Premium Navigation */}
      <nav className="sticky top-0 z-50 bg-blue-950 backdrop-blur-md border-b border-blue-900/50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4 group">
              <Logo className="h-12 w-auto transition-transform group-hover:scale-105" />
              <div className="hidden sm:block border-l border-blue-900/50 pl-4">
                <p className="text-xl font-black text-white">SIREN</p>
                <p className="text-[10px] text-blue-300 uppercase tracking-[0.2em] font-bold">Safety First</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <Link
                to="/auth"
                className="px-6 py-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/30 font-semibold text-sm active:scale-95"
              >
                Login / Sign Up
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-900 to-indigo-900 pt-20 pb-32">
          {/* Decorative Elements */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400 rounded-full blur-[100px]"></div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center max-w-4xl mx-auto">
              <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 tracking-tight leading-tight">
                SIREN
              </h1>
              <p className="text-xl md:text-2xl font-medium text-blue-200 mb-8 tracking-wide">
                Sensor-based Indicator for Risk and Environmental Notification
              </p>
              <p className="text-lg md:text-xl text-blue-100/80 mb-10 leading-relaxed font-light">
                A smart helmet system that monitors hazardous environments in real time, predicts risks early, and triggers alerts even when networks fail.
              </p>
              <Link
                to="/auth"
                className="inline-block px-10 py-4 bg-white text-blue-900 rounded-full hover:bg-blue-50 transition-all text-lg font-bold shadow-xl hover:-translate-y-1"
              >
                Explore the System
              </Link>
            </div>
          </div>
        </section>

        {/* The Problem & Solution Section */}
        <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* The Problem */}
            <div className="bg-red-50 rounded-3xl p-10 border border-red-100 shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 text-red-600 rounded-xl mb-6 shadow-inner">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-6 tracking-tight">The Problem</h3>
              <p className="text-gray-700 font-medium mb-6">Hazardous workplaces like mines and industrial sites remain dangerous because risks are detected too late.</p>
              <ul className="space-y-4">
                {[
                  "Toxic gases are invisible.",
                  "Environmental conditions change rapidly.",
                  "Communication systems fail underground.",
                  "Most safety setups react only after thresholds are crossed."
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start text-gray-600">
                    <span className="text-red-500 mr-3 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-6 border-t border-red-200">
                <p className="text-red-800 font-bold italic leading-relaxed">
                  "What this really means is delayed alerts, slower response, and avoidable accidents."
                </p>
              </div>
            </div>

            {/* The Solution */}
            <div className="bg-blue-600 rounded-3xl p-10 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.9L10 .3l7.834 4.6a1 1 0 01.5.866v7.351a1 1 0 01-.5.866l-7.834 4.602a1 1 0 01-1 0L2.166 14.167a1 1 0 01-.5-.866V5.766a1 1 0 01.5-.866z" />
                </svg>
              </div>
              <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl mb-6 backdrop-blur-sm">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold mb-6 tracking-tight">The Solution</h3>
              <p className="text-blue-100 text-lg leading-relaxed mb-6 font-medium">
                This system moves safety from fixed infrastructure to the worker.
              </p>
              <p className="text-blue-50 leading-relaxed mb-6">
                Each helmet continuously senses environmental conditions, analyzes risk trends locally, and alerts both the wearer and supervisors in real time.
              </p>
              <p className="text-blue-50 leading-relaxed font-bold">
                Instead of waiting for danger to cross a hard limit, the system anticipates unsafe patterns and acts early. Even without active connectivity, emergency alerts still work.
              </p>
            </div>
          </div>
        </section>

        {/* Key Features Section */}
        <section className="bg-white py-24 border-y border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl mb-4">Key Features</h2>
              <div className="w-24 h-1.5 bg-blue-600 mx-auto rounded-full"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "Real-Time Environmental Monitoring",
                  desc: "Continuous tracking of gas concentration, temperature, and humidity directly around the worker.",
                  icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                },
                {
                  title: "Predictive Risk Detection",
                  desc: "Machine learning models identify hazardous trends before conditions become critical.",
                  icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                },
                {
                  title: "Offline SOS Signaling",
                  desc: "Emergency distress alerts that function without relying on network availability.",
                  icon: "M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                },
                {
                  title: "Automatic Visibility Control",
                  desc: "Built-in lighting activates automatically in low-light conditions, no manual action needed.",
                  icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M12 7a5 5 0 100 10 5 5 0 000-10z"
                },
                {
                  title: "Cloud-Based Supervision",
                  desc: "Live dashboards show sensor data, alerts, history, and device health for supervisors.",
                  icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                }
              ].map((feature, idx) => (
                <div key={idx} className="group p-8 rounded-2xl border border-gray-50 bg-gray-50/50 hover:bg-white transition-all hover:shadow-xl hover:border-blue-100">
                  <div className="w-14 h-14 bg-white text-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-sm ring-1 ring-gray-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} />
                    </svg>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h4>
                  <p className="text-gray-600 leading-relaxed font-medium">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-24 bg-gray-900 text-white overflow-hidden relative">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_30%_50%,rgba(37,99,235,0.1),transparent)]"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex flex-col lg:flex-row gap-16">
              <div className="lg:w-1/3">
                <h2 className="text-4xl font-extrabold mb-6 tracking-tight">How It Works</h2>
                <p className="text-gray-400 text-lg leading-relaxed mb-8">
                  Simple, reliable, and designed for real-world constraints.
                </p>
                <div className="inline-block p-1 px-3 rounded-full bg-blue-900/50 border border-blue-500/30 text-blue-400 text-xs font-black uppercase tracking-widest">Process Workflow</div>
              </div>
              <div className="lg:w-2/3">
                <div className="space-y-12">
                  {[
                    { step: "01", title: "Data Capture", desc: "Sensors mounted on the helmet capture environmental data continuously" },
                    { step: "02", title: "Edge Processing", desc: "Data is processed and buffered locally on the device for minimal latency" },
                    { step: "03", title: "Immediate Response", desc: "Immediate alerts trigger if unsafe conditions are detected" },
                    { step: "04", title: "Cloud Synchronization", desc: "Encrypted data syncs to the cloud when connectivity is available" },
                    { step: "05", title: "Supervisory Insight", desc: "Supervisors monitor conditions through a centralized dashboard" }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-8 group">
                      <div className="flex-shrink-0 text-3xl font-black text-blue-500/30 group-hover:text-blue-500 transition-colors">{item.step}</div>
                      <div>
                        <h4 className="text-xl font-bold mb-2 group-hover:translate-x-1 transition-transform">{item.title}</h4>
                        <p className="text-gray-400 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For & Difference */}
        <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Who It's For */}
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900 mb-8 border-l-4 border-blue-600 pl-4">Who It’s For</h2>
              <div className="grid grid-cols-1 gap-4">
                {[
                  "Underground mining operations",
                  "Industrial safety and compliance teams",
                  "Supervisors and control rooms",
                  "Research, pilot, and safety innovation programs"
                ].map((item, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 flex items-center space-x-3 shadow-sm hover:translate-x-2 transition-transform">
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                    <p className="text-gray-700 font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* What Makes It Different */}
            <div className="bg-gradient-to-br from-gray-900 to-blue-900 rounded-3xl p-10 text-white shadow-xl">
              <h2 className="text-3xl font-extrabold mb-8">What Makes It Different</h2>
              <div className="space-y-6">
                {[
                  { title: "Prevention-First", text: "Predictive alerts instead of static threshold alarms" },
                  { title: "Decentralized", text: "Wearable intelligence, not fixed monitoring stations" },
                  { title: "Resilient", text: "Works in zero-network environments" },
                  { title: "Built for Reality", text: "Designed for harsh, confined, real-world conditions" }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <svg className="w-6 h-6 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="font-bold text-blue-400 mb-1">{item.title}</p>
                      <p className="text-gray-300 text-sm">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-xl font-bold tracking-tight italic">
                  "This isn’t just monitoring. It’s prevention."
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-blue-600 py-16 text-center text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-4xl font-black mb-8">Ready to enhance your workplace safety?</h2>
            <Link
              to="/auth"
              className="inline-block px-12 py-4 bg-white text-blue-600 rounded-full hover:bg-gray-100 transition-all text-xl font-black shadow-2xl active:scale-95"
            >
              Get Started Now
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default LandingPage

