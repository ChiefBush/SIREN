import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

function AuthPage() {
  const [supabaseConfigured, setSupabaseConfigured] = useState(true)

  useEffect(() => {
    // Check if Supabase is properly configured
    const url = process.env.REACT_APP_SUPABASE_URL
    const key = process.env.REACT_APP_SUPABASE_ANON_KEY

    if (!url || !key || url === 'YOUR_SUPABASE_URL' || !url.startsWith('http')) {
      setSupabaseConfigured(false)
    }
  }, [])
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role] = useState('miner')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const navigate = useNavigate()

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validateName = (name) => {
    // Only letters and spaces allowed
    const nameRegex = /^[A-Za-z\s]+$/
    return nameRegex.test(name.trim())
  }

  const validatePassword = (password) => {
    const hasMinLength = password.length >= 8
    const hasUpperCase = /[A-Z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)

    return {
      valid: hasMinLength && hasUpperCase && hasNumber && hasSpecialChar,
      errors: {
        minLength: !hasMinLength,
        upperCase: !hasUpperCase,
        number: !hasNumber,
        specialChar: !hasSpecialChar,
      },
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!isLogin) {
      // Sign up validations
      if (!fullName.trim()) {
        newErrors.fullName = 'Full name is required'
      } else if (!validateName(fullName)) {
        newErrors.fullName = 'Name can only contain letters and spaces'
      }

      if (!email.trim()) {
        newErrors.email = 'Email is required'
      } else if (!validateEmail(email)) {
        newErrors.email = 'Please enter a valid email address'
      }

      if (!password) {
        newErrors.password = 'Password is required'
      } else {
        const passwordValidation = validatePassword(password)
        if (!passwordValidation.valid) {
          newErrors.password = 'Password does not meet requirements'
        }
      }

      if (!confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password'
      } else if (password !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }

    } else {
      // Login validations
      if (!email.trim()) {
        newErrors.email = 'Email is required'
      } else if (!validateEmail(email)) {
        newErrors.email = 'Please enter a valid email address'
      }

      if (!password) {
        newErrors.password = 'Password is required'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const checkEmailUniqueness = async (email) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .single()

      return !data // If no data, email is unique
    } catch (error) {
      return true // Assume unique if error (email not found)
    }
  }

  const handleNameChange = (e) => {
    const value = e.target.value
    // Only allow letters and spaces
    if (value === '' || /^[A-Za-z\s]*$/.test(value)) {
      setFullName(value)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setErrors({})

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      if (isLogin) {
        // Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          console.error('Login error:', error)
          throw error
        }

        if (data.user) {
          // Fetch user role and redirect to appropriate dashboard
          try {
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('role')
              .eq('id', data.user.id)
              .single()

            if (userError) {
              console.error('Error fetching user role:', userError)
              // If user doesn't exist in users table, create a default entry
              const { error: insertError } = await supabase.from('users').insert([
                {
                  id: data.user.id,
                  email: email.trim(),
                  full_name: data.user.user_metadata?.full_name || '',
                  role: 'miner', // Default role
                },
              ])

              if (insertError) {
                console.error('Error creating user record:', insertError)
              }

              // Redirect to miner dashboard as default
              navigate('/miner', { replace: true })
            } else {
              // Log the raw data from database
              console.log('Raw user data from database:', userData)
              console.log('Raw role value:', userData?.role, 'Type:', typeof userData?.role)

              // Normalize role to lowercase and ensure it's valid
              let userRole = (userData?.role || 'miner').toLowerCase().trim()

              // Log after normalization
              console.log('Normalized role:', userRole)

              // Validate role and map to correct dashboard route
              const validRoles = ['miner', 'supervisor', 'admin']
              if (!validRoles.includes(userRole)) {
                console.error(`❌ INVALID ROLE: "${userRole}" is not in valid roles:`, validRoles)
                console.error('Raw role from DB:', userData?.role)
                console.error('User data:', userData)
                userRole = 'miner'
              }

              console.log(`✅ User logged in with role: "${userRole}", redirecting to /${userRole}`)

              // Store role in sessionStorage to help with route protection
              sessionStorage.setItem('userRole', userRole)

              // Wait a bit longer to ensure App.jsx has time to update its state
              await new Promise(resolve => setTimeout(resolve, 300))

              // Redirect to role-specific dashboard
              navigate(`/${userRole}`, { replace: true })
            }
          } catch (fetchError) {
            console.error('Error in role fetch:', fetchError)
            // Default to miner dashboard if role fetch fails
            navigate('/miner', { replace: true })
          }
        }
      } else {
        // Sign Up - Additional validations
        const isEmailUnique = await checkEmailUniqueness(email)
        if (!isEmailUnique) {
          setErrors({ email: 'This email is already registered' })
          setLoading(false)
          return
        }

        const passwordValidation = validatePassword(password)
        if (!passwordValidation.valid) {
          setErrors({ password: 'Password does not meet all requirements' })
          setLoading(false)
          return
        }

        if (password !== confirmPassword) {
          setErrors({ confirmPassword: 'Passwords do not match' })
          setLoading(false)
          return
        }

        if (!validateName(fullName)) {
          setErrors({ fullName: 'Name can only contain letters and spaces' })
          setLoading(false)
          return
        }

        // Normalize role to lowercase to match database constraint
        const normalizedRole = role.toLowerCase().trim()

        // Validate role matches expected values
        if (!['miner', 'supervisor', 'admin'].includes(normalizedRole)) {
          throw new Error(`Invalid role selected. Please select a valid role.`)
        }

        // Sign up with role in user_metadata
        // The database trigger will automatically create the user record
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: normalizedRole, // Pass role to trigger via metadata
            },
          },
        })

        if (error) {
          console.error('Signup error:', error)
          throw error
        }

        // The database trigger should have automatically created the user record
        // Verify it was created (with a small delay for trigger to complete)
        if (data.user) {
          console.log('Auth user created, waiting for trigger to create user record...')

          // Wait a bit for the trigger to complete
          await new Promise(resolve => setTimeout(resolve, 500))

          // Verify user record was created
          const { data: userData, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single()

          if (fetchError || !userData) {
            console.warn('User record not found after signup. Trigger may have failed:', fetchError)
            // Don't throw error - the trigger might still be processing
            // User can still log in and the record will be created on first login
          } else {
            console.log('User record created successfully by trigger:', userData)
          }

          setMessage('Account created successfully! ' +
            (data.user?.email_confirmed_at
              ? 'You can now log in.'
              : 'Please check your email (and spam folder) for verification. If you don\'t receive it, email confirmation may be disabled in Supabase settings.'))
          setTimeout(() => {
            setIsLogin(true)
            setEmail('')
            setPassword('')
            setConfirmPassword('')
            setFullName('')
            setErrors({})
          }, 2000)
        }
      }
    } catch (error) {
      console.error('Authentication error:', error)
      console.error('Error stack:', error.stack)

      // Provide more specific error messages
      if (error.message?.includes('Invalid API key') || error.message?.includes('JWT')) {
        setError('Invalid API key: Please check your REACT_APP_SUPABASE_ANON_KEY in the .env file. Make sure you copied the complete "anon public" key from Supabase Settings → API. Then restart the server.')
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        setError('Network error: Please check your internet connection and Supabase configuration. Make sure your .env file has correct REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY values, then restart the server.')
      } else if (error.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.')
      } else if (error.message?.includes('Email not confirmed')) {
        setError('Please check your email and confirm your account before logging in.')
      } else if (error.message?.includes('Database error') || error.message?.includes('Database permission') || error.message?.includes('Database table')) {
        // Database errors - show the message as-is
        setError(error.message)
      } else {
        setError(error.message || 'An error occurred. Please check the browser console (F12) for details and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const passwordValidation = !isLogin ? validatePassword(password) : null
  const isFormValid = !isLogin
    ? fullName.trim() &&
    validateName(fullName) &&
    email.trim() &&
    validateEmail(email) &&
    password &&
    passwordValidation?.valid &&
    confirmPassword &&
    password === confirmPassword
    : email.trim() && validateEmail(email) && password

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-blue-950 rounded-2xl shadow-2xl p-10 border border-blue-900">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo className="h-24" />
          </div>
        </div>

        {/* Toggle Tabs */}
        <div className="flex mb-8 bg-blue-900/50 rounded-xl p-1.5">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true)
              setError('')
              setMessage('')
              setErrors({})
            }}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${isLogin
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-blue-200 hover:text-white hover:bg-blue-800/50'
              }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false)
              setError('')
              setMessage('')
              setErrors({})
            }}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${!isLogin
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-blue-200 hover:text-white hover:bg-blue-800/50'
              }`}
          >
            Sign Up
          </button>
        </div>

        {/* Supabase Configuration Warning */}
        {!supabaseConfigured && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg">
            <p className="font-semibold mb-2">[WARNING] Supabase Not Configured</p>
            <p className="text-sm mb-2">Please create a <code className="bg-yellow-100 px-1 rounded">.env</code> file in the root directory with:</p>
            <pre className="text-xs bg-yellow-100 p-2 rounded overflow-x-auto">
              {`REACT_APP_SUPABASE_URL=your_url
REACT_APP_SUPABASE_ANON_KEY=your_key`}
            </pre>
            <p className="text-sm mt-2">Then restart the development server.</p>
          </div>
        )}

        {/* Error/Message Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label htmlFor="fullName" className="block text-sm font-semibold text-blue-100 mb-2">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={handleNameChange}
                  required
                  className={`w-full px-4 py-3 bg-blue-900/40 border border-blue-800 rounded-xl text-white placeholder-blue-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors.fullName ? 'border-red-500' : ''
                    }`}
                  placeholder="Enter your full name"
                />
                {errors.fullName && (
                  <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>
                )}
              </div>

            </>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-blue-100 mb-2">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full px-4 py-3 bg-blue-900/40 border border-blue-800 rounded-xl text-white placeholder-blue-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors.email ? 'border-red-500' : ''
                }`}
              placeholder="Enter your email"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-blue-100 mb-2">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full px-4 py-3 bg-blue-900/40 border border-blue-800 rounded-xl text-white placeholder-blue-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors.password ? 'border-red-500' : ''
                }`}
              placeholder="Enter your password"
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
            {!isLogin && password && (
              <div className="mt-3 text-xs bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
                <p className="text-blue-100 font-bold mb-2">Password requirements:</p>
                <ul className="space-y-1">
                  <li className={password.length >= 8 ? 'text-green-400' : 'text-blue-300'}>
                    • 8+ characters
                  </li>
                  <li className={/[A-Z]/.test(password) ? 'text-green-400' : 'text-blue-300'}>
                    • 1 uppercase letter
                  </li>
                  <li className={/[0-9]/.test(password) ? 'text-green-400' : 'text-blue-300'}>
                    • 1 number
                  </li>
                  <li
                    className={
                      /[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'text-green-400' : 'text-blue-300'
                    }
                  >
                    • 1 special character
                  </li>
                </ul>
              </div>
            )}
          </div>

          {!isLogin && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-semibold text-blue-100 mb-2"
              >
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={`w-full px-4 py-3 bg-blue-900/40 border border-blue-800 rounded-xl text-white placeholder-blue-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors.confirmPassword ? 'border-red-500' : ''
                  }`}
                placeholder="Confirm your password"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
              )}
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 mt-4"
          >
            {loading ? 'Processing...' : isLogin ? 'Login to SIREN' : 'Create My Account'}
          </button>
        </form>

        {/* Back to Landing */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-blue-300 hover:text-white transition-colors flex items-center justify-center space-x-2 w-full"
          >
            <span>←</span>
            <span>Return to Landing Page</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthPage

