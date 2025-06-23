import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useAuth } from '../../context/AuthContext'
import { getAuthErrorMessage, AuthService } from '../../services/authService'
import { TradeTrackerLogo } from '../icons/TradeTrackerLogo'
import { AnimatedBrandName } from '../AnimatedBrandName'
import '../../styles/auth-performance.css'

type AuthMode = 'signin' | 'signup' | 'forgot-password'

interface AuthModalProps {
  isOpen?: boolean
  onClose?: () => void
  onGuestMode?: () => void
  onShowAuth?: () => void
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen = true, onClose, onGuestMode, onShowAuth }) => {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Prevent initial render stutter
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { signIn, signUp, signInWithProvider, resetPassword, resendVerification } = useAuth()

  // Optimized animation variants with GPU acceleration
  const containerVariants = {
    hidden: {
      opacity: 0,
      scale: 0.98,
      y: 10,
      filter: "blur(4px)"
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.25,
        ease: [0.25, 0.46, 0.45, 0.94],
        filter: { duration: 0.15 }
      }
    },
    exit: {
      opacity: 0,
      scale: 0.98,
      y: -10,
      filter: "blur(4px)",
      transition: {
        duration: 0.2,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    }
  }

  const formVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.2,
        delay: 0.05,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    },
    exit: {
      opacity: 0,
      y: -8,
      transition: { duration: 0.15 }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // Prevent event bubbling
    console.log('🔐 Form submitted, mode:', mode, 'email:', email)

    // Clear any existing errors/success messages
    setError('')
    setSuccess('')
    setIsLoading(true)

    // Prevent any potential page refresh
    if (e.target) {
      (e.target as HTMLFormElement).setAttribute('data-submitting', 'true')
    }

    try {
      if (mode === 'signin') {
        console.log('🔐 Attempting sign in...')
        const { error } = await signIn(email, password)

        if (error) {
          console.error('❌ Sign in error received:', error)
          const errorCode = getAuthErrorMessage({ message: error } as any)
          console.log('📝 Error code mapped to:', errorCode)

          // Handle specific error cases with custom messages
          if (errorCode === 'INVALID_CREDENTIALS') {
            // Simple, direct error message like password reset
            const errorMessage = `❌ Incorrect email or password!

💡 New user? Click "Sign Up Instead" below to create an account.`
            console.log('🔴 Setting error message:', errorMessage)
            setError(errorMessage)
            console.log('🔴 Error state should now be:', errorMessage)
          } else if (errorCode === 'EMAIL_NOT_CONFIRMED') {
            const emailError = `❌ Email not verified! Check your inbox and click the verification link.`
            setError(emailError)
          } else {
            setError(errorCode)
          }
          console.log('❌ Error set in UI:', errorCode)
        } else {
          console.log('✅ Sign in successful!')
        }
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          return
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters long')
          return
        }

        const { error } = await signUp(email, password, firstName, lastName)
        if (error) {
          setError(getAuthErrorMessage({ message: error } as any))
        } else {
          setSuccess(`✅ Account created successfully!

📧 Please check your email (${email}) for a verification link.

⚠️ You must verify your email before you can sign in.

💡 Check your spam folder if you don't see the email within a few minutes.`)
          setMode('signin')
          setPassword('')
          setConfirmPassword('')
        }
      } else if (mode === 'forgot-password') {
        const { error } = await resetPassword(email)
        if (error) {
          setError(getAuthErrorMessage({ message: error } as any))
        } else {
          setSuccess(`If this email exists, a reset link was sent.`)
          setMode('signin')
        }
      }
    } catch (error) {
      console.error('❌ Unexpected error in handleSubmit:', error)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
      console.log('🔄 Form submission completed, loading set to false')

      // Remove the submitting attribute
      if (e.target) {
        (e.target as HTMLFormElement).removeAttribute('data-submitting')
      }
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setFirstName('')
    setLastName('')
    setError('')
    setSuccess('')
    setShowPassword(false)
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    resetForm()
  }

  const handleResendVerification = async () => {
    if (!email) {
      setError('Please enter your email address first')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const { error } = await resendVerification(email)
      if (error) {
        setError(error)
      } else {
        setSuccess(`Verification email sent! Check your inbox.`)
      }
    } catch (error) {
      setError('Failed to resend verification email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialAuth = async (provider: 'twitter' | 'google' | 'github') => {
    setIsLoading(true)
    setError('')
    setSuccess('')

    const { error } = await signInWithProvider(provider)

    if (error) {
      setError(error)
      setIsLoading(false)
    }
    // If successful, the user will be redirected, so we don't need to set loading to false
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Optimized Background Overlay */}
      <motion.div
        className="auth-modal-backdrop absolute inset-0 bg-black/15"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={isReady ? "visible" : "hidden"}
        exit="exit"
        className="auth-modal-container relative w-full max-w-sm z-10"
        data-loading={!isReady}
      >
        {/* Optimized Card with GPU acceleration */}
        <div className="auth-modal-card relative bg-white/98 dark:bg-black/98 border border-gray-200/30 dark:border-gray-700/30 rounded-xl shadow-xl overflow-hidden">
          {/* Content */}
          <div className="p-6">
            {/* Minimal Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center mb-4">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6 text-black dark:text-white"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path
                    d="M12 6L16 10L12 18L8 10L12 6Z"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <h1 className="text-lg font-semibold text-black dark:text-white mb-1">
                {mode === 'signin' && 'Sign In'}
                {mode === 'signup' && 'Sign Up'}
                {mode === 'forgot-password' && 'Reset Password'}
              </h1>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {mode === 'signin' && 'Welcome back'}
                {mode === 'signup' && 'Create your account'}
                {mode === 'forgot-password' && 'Enter your email'}
              </p>
            </div>

            {/* Minimal Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-center">
                <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                  {error}
                </p>
                {(error.includes('Email not verified') || error.includes('Sign in failed')) && (
                  <div className="mt-2 flex justify-center gap-2">
                    {error.includes('Email not verified') && (
                      <button
                        onClick={handleResendVerification}
                        disabled={isLoading || !email}
                        className="text-xs text-red-600 dark:text-red-400 underline hover:no-underline disabled:opacity-50"
                      >
                        Resend Email
                      </button>
                    )}
                    {error.includes('Sign in failed') && mode === 'signin' && (
                      <button
                        onClick={() => switchMode('signup')}
                        className="text-xs text-red-600 dark:text-red-400 underline hover:no-underline"
                      >
                        Sign Up Instead
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}



            {/* Minimal Success Message */}
            {success && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {success}
                </p>
              </div>
            )}

            {/* Optimized Form */}
            <form
              onSubmit={handleSubmit}
              className="auth-form-container space-y-3"
              noValidate
              autoComplete="off"
              data-testid="auth-form"
            >
              {/* Name Fields for Signup */}
              {mode === 'signup' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="auth-input w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm focus:outline-none focus:border-black dark:focus:border-white"
                  />
                  <input
                    type="text"
                    placeholder="Last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  />
                </div>
              )}

              {/* Email Field */}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
              />

              {/* Password Field */}
              {mode !== 'forgot-password' && (
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Icon icon={showPassword ? 'mdi:eye-off' : 'mdi:eye'} className="text-sm" />
                  </button>
                </div>
              )}

              {/* Confirm Password Field */}
              {mode === 'signup' && (
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Icon icon={showConfirmPassword ? 'mdi:eye-off' : 'mdi:eye'} className="text-sm" />
                  </button>
                </div>
              )}

              {/* Forgot Password Link - Only show for sign in mode */}
              {mode === 'signin' && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot-password')}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors underline"
                  >
                    Forgot your password?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="auth-button w-full py-2 px-4 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="auth-spinner w-4 h-4 border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full" />
                  </div>
                ) : (
                  <>
                    {mode === 'signin' && 'Sign In'}
                    {mode === 'signup' && 'Sign Up'}
                    {mode === 'forgot-password' && 'Send Reset Email'}
                  </>
                )}
              </button>
            </form>

            {/* Social Authentication */}
            {mode !== 'forgot-password' && (
              <div className="mt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-black px-2 text-gray-500 dark:text-gray-400">
                      OR CONTINUE WITH
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {/* Continue with X (Twitter) */}
                  <button
                    type="button"
                    onClick={() => handleSocialAuth('twitter')}
                    disabled={isLoading}
                    className="social-auth-button w-full flex items-center justify-center px-3 py-2 border border-gray-200 dark:border-gray-700 rounded text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon icon="mdi:twitter" className="w-4 h-4 mr-2" />
                    Continue with X
                  </button>

                  {/* Continue with Google */}
                  <button
                    type="button"
                    onClick={() => handleSocialAuth('google')}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center px-3 py-2 border border-gray-200 dark:border-gray-700 rounded text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon icon="mdi:google" className="w-4 h-4 mr-2" />
                    Continue with Google
                  </button>

                  {/* Continue with GitHub */}
                  <button
                    type="button"
                    onClick={() => handleSocialAuth('github')}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center px-3 py-2 border border-gray-200 dark:border-gray-700 rounded text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon icon="mdi:github" className="w-4 h-4 mr-2" />
                    Continue with GitHub
                  </button>
                </div>
              </div>
            )}

            {/* Minimal Navigation */}
            <div className="mt-4 text-center space-y-2">
              {mode === 'signin' && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Don't have an account?{' '}
                  <button
                    onClick={() => switchMode('signup')}
                    className="text-black dark:text-white underline hover:no-underline transition-colors"
                  >
                    Sign up
                  </button>
                </p>
              )}

              {mode === 'signup' && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Already have an account?{' '}
                    <button
                      onClick={() => switchMode('signin')}
                      className="text-black dark:text-white underline hover:no-underline transition-colors"
                    >
                      Sign in
                    </button>
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Forgot your password?{' '}
                    <button
                      onClick={() => switchMode('forgot-password')}
                      className="text-black dark:text-white underline hover:no-underline transition-colors"
                    >
                      Reset it
                    </button>
                  </p>
                </div>
              )}

              {mode === 'forgot-password' && (
                <div className="space-y-1">
                  <button
                    onClick={() => switchMode('signin')}
                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors underline"
                  >
                    ← Back to sign in
                  </button>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Don't have an account?{' '}
                    <button
                      onClick={() => switchMode('signup')}
                      className="text-black dark:text-white underline hover:no-underline transition-colors"
                    >
                      Sign up
                    </button>
                  </p>
                </div>
              )}
            </div>

            {/* Guest Mode Option */}
            {onGuestMode && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
                <button
                  onClick={onGuestMode}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Continue as Guest
                </button>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Limited features available
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
