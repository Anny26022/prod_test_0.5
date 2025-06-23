import { supabase } from '../lib/supabase'
import type { User, Session, AuthError } from '@supabase/supabase-js'

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
}

export interface SignUpData {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export interface SignInData {
  email: string
  password: string
}

export class AuthService {
  /**
   * Sign up a new user with email and password
   */
  static async signUp({ email, password, firstName, lastName }: SignUpData) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || '',
          }
        }
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Sign in an existing user with email and password
   */
  static async signIn({ email, password }: SignInData) {
    try {
      console.log('🔐 Attempting sign in for email:', email)

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        console.error('❌ Sign in error:', error.message)
        throw error
      }

      console.log('✅ Sign in successful for user:', data.user?.email)
      return { data, error: null }
    } catch (error) {
      const authError = error as AuthError
      console.error('❌ Sign in failed:', authError.message)
      return { data: null, error: authError }
    }
  }

  /**
   * Sign in with OAuth provider (Twitter, Google, GitHub)
   */
  static async signInWithProvider(provider: 'twitter' | 'google' | 'github') {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      return { error: null }
    } catch (error) {
      return { error: error as AuthError }
    }
  }

  /**
   * Send password reset email
   */
  static async resetPassword(email: string) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Update user password
   */
  static async updatePassword(newPassword: string) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Resend email verification
   */
  static async resendVerification(email: string) {
    try {
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Check if user exists (for better error messaging)
   */
  static async checkUserExists(email: string): Promise<boolean> {
    try {
      // Try to initiate password reset - this will tell us if user exists
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      // If no error, user exists
      // If error contains "User not found", user doesn't exist
      if (error && error.message.includes('User not found')) {
        return false
      }

      return true
    } catch (error) {
      // If there's an error, assume user doesn't exist
      return false
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(updates: {
    email?: string
    firstName?: string
    lastName?: string
  }) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        email: updates.email,
        data: {
          first_name: updates.firstName,
          last_name: updates.lastName,
          full_name: updates.firstName && updates.lastName
            ? `${updates.firstName} ${updates.lastName}`
            : updates.firstName || updates.lastName || '',
        }
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Get current user
   */
  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error) {
        // Don't log session missing errors as they're expected on initial load
        if (error.message !== 'Auth session missing!') {
          console.error('Auth error getting user:', error)
        }
        throw error
      }

      return { user, error: null }
    } catch (error) {
      // Only log non-session-missing errors
      const authError = error as AuthError
      if (authError.message !== 'Auth session missing!') {
        console.error('Auth error in getCurrentUser:', authError)
      }
      return { user: null, error: authError }
    }
  }

  /**
   * Get current session
   */
  static async getCurrentSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        throw error
      }

      return { session, error: null }
    } catch (error) {
      return { session: null, error: error as AuthError }
    }
  }

  /**
   * Listen to auth state changes
   */
  static onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const { session } = await this.getCurrentSession()
    return !!session
  }

  /**
   * Get user ID if authenticated
   */
  static async getUserId(): Promise<string | null> {
    const { user } = await this.getCurrentUser()
    const userId = user?.id || null

    if (userId) {
      console.log('🔐 User authenticated with ID:', userId)
    } else {
      console.log('❌ No authenticated user found')
    }

    return userId
  }

  /**
   * Refresh session
   */
  static async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession()

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as AuthError }
    }
  }
}

// Export auth state management utilities
export const getAuthState = async (): Promise<AuthState> => {
  try {
    const { session } = await AuthService.getCurrentSession()
    const { user } = await AuthService.getCurrentUser()

    return {
      user,
      session,
      loading: false,
      error: null
    }
  } catch (error) {
    const authError = error as AuthError
    // Don't treat session missing as an error state
    if (authError.message === 'Auth session missing!') {
      return {
        user: null,
        session: null,
        loading: false,
        error: null
      }
    }

    return {
      user: null,
      session: null,
      loading: false,
      error: authError.message
    }
  }
}

// Helper function to handle auth errors
export const getAuthErrorMessage = (error: AuthError | null): string => {
  if (!error) return ''

  console.log('🔍 Processing auth error:', error.message)

  switch (error.message) {
    case 'Invalid login credentials':
      return 'INVALID_CREDENTIALS'
    case 'Email not confirmed':
    case 'Email link is invalid or has expired':
    case 'Signup requires a valid password':
      return 'EMAIL_NOT_CONFIRMED'
    case 'User already registered':
      return 'An account with this email already exists. Please sign in instead.'
    case 'Password should be at least 6 characters':
      return 'Password must be at least 6 characters long.'
    case 'Unable to validate email address: invalid format':
      return 'Please enter a valid email address.'
    case 'Signup is disabled':
      return 'New user registration is currently disabled.'
    case 'For security purposes, you can only request this once every 60 seconds':
      return 'Please wait 60 seconds before requesting another verification email.'
    case 'Auth session missing!':
      return 'SESSION_MISSING'
    default:
      // Check for specific error patterns
      if (error.message.toLowerCase().includes('invalid login') ||
          error.message.toLowerCase().includes('invalid credentials') ||
          error.message.toLowerCase().includes('wrong password') ||
          error.message.toLowerCase().includes('incorrect password')) {
        return 'INVALID_CREDENTIALS'
      }

      // Check for email confirmation related errors
      if (error.message.toLowerCase().includes('confirm') ||
          error.message.toLowerCase().includes('verify') ||
          error.message.toLowerCase().includes('email')) {
        return 'EMAIL_NOT_CONFIRMED'
      }

      console.log('⚠️ Unhandled auth error:', error.message)
      return error.message || 'An unexpected error occurred. Please try again.'
  }
}
