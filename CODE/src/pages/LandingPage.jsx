import { Link } from 'react-router-dom'

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl font-bold">S</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SIREN</h1>
                <p className="text-sm text-gray-600">Sensor based indicator for risk in environmental notification</p>
              </div>
            </div>
            <Link
              to="/auth"
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Login / Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Advanced Safety & Workforce Management System
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Real-time monitoring and workforce tracking for miners and firefighters to ensure safety and operational efficiency
          </p>
          <Link
            to="/auth"
            className="inline-block px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-lg font-semibold"
          >
            Get Started
          </Link>
        </div>

        {/* About Us Section */}
        <section className="mb-16">
          <h3 className="text-3xl font-bold text-gray-900 mb-6 text-center">About the Project</h3>
          <div className="bg-white rounded-lg shadow-md p-8">
            <p className="text-gray-700 leading-relaxed mb-4">
              SIREN (Sensor based indicator for risk in environmental notification) is a comprehensive 
              safety and workforce management web application designed specifically for miners and firefighters. 
              The system integrates real-time IoT sensor data with workforce monitoring to ensure the safety 
              and well-being of workers in hazardous environments.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Our mission is to provide real-time environmental monitoring, workforce tracking, and safety 
              management tools that help prevent accidents and ensure quick response to emergencies.
            </p>
          </div>
        </section>

        {/* Purpose Section */}
        <section className="mb-16">
          <h3 className="text-3xl font-bold text-gray-900 mb-6 text-center">Purpose of the Project</h3>
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-4xl mb-3">🛡️</div>
                <h4 className="font-semibold text-gray-900 mb-2">Improve Worker Safety</h4>
                <p className="text-gray-600 text-sm">
                  Real-time monitoring of environmental conditions and worker health to prevent accidents
                </p>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <h4 className="font-semibold text-gray-900 mb-2">Enable Real-time Monitoring</h4>
                <p className="text-gray-600 text-sm">
                  Continuous tracking of sensor data and worker status for immediate response
                </p>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">📈</div>
                <h4 className="font-semibold text-gray-900 mb-2">Support Data-Driven Decisions</h4>
                <p className="text-gray-600 text-sm">
                  Analytics and reporting tools to make informed safety and operational decisions
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Key Functionalities */}
        <section className="mb-16">
          <h3 className="text-3xl font-bold text-gray-900 mb-6 text-center">Key Functionalities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              'Role-based dashboards',
              'Real-time monitoring',
              'Attendance & workforce tracking',
              'Safety alerts & reporting',
            ].map((feature, index) => (
              <div key={index} className="bg-white rounded-lg shadow-md p-6 text-center">
                <div className="text-2xl mb-2">✓</div>
                <p className="font-medium text-gray-900">{feature}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to Use */}
        <section className="mb-16">
          <h3 className="text-3xl font-bold text-gray-900 mb-6 text-center">How to Use</h3>
          <div className="bg-white rounded-lg shadow-md p-8">
            <ol className="space-y-4 text-gray-700 max-w-2xl mx-auto">
              <li className="flex items-start">
                <span className="font-bold text-primary-600 mr-3">1.</span>
                <span>Click "Get Started" or "Login / Sign Up" to access the authentication page</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-primary-600 mr-3">2.</span>
                <span>If you are a new user, switch to "Sign Up" tab and create an account with your details</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-primary-600 mr-3">3.</span>
                <span>If you already have an account, use the "Login" tab to sign in</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-primary-600 mr-3">4.</span>
                <span>After authentication, you will be redirected to your role-specific dashboard</span>
              </li>
            </ol>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-gray-600 py-8 border-t border-gray-200">
          <p>&copy; 2024 SIREN. All rights reserved.</p>
        </footer>
      </main>
    </div>
  )
}

export default LandingPage

