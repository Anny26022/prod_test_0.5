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
      console.error('Sign up error:', error)
      return { data: null, error: error as AuthError }
    }
  }

  /**
   * Sign in an existing user with email and password
   */
  static async signIn({ email, password }: SignInData) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        throw error
      }

      return { data, error: null }
    } catch (error) {
      console.error('Sign in error:', error)
      return { data: null, error: error as AuthError }
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
      console.error(`${provider} sign in error:`, error)
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
      console.error('Sign out error:', error)
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
      console.error('Password reset error:', error)
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
      console.error('Update password error:', error)
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
      console.error('Resend verification error:', error)
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
      console.error('Update profile error:', error)
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
          console.error('Get current user error:', error)
        }
        throw error
      }

      return { user, error: null }
    } catch (error) {
      // Only log non-session-missing errors
      const authError = error as AuthError
      if (authError.message !== 'Auth session missing!') {
        console.error('Get current user error:', error)
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
      console.error('Get current session error:', error)
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
    return user?.id || null
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
      console.error('Refresh session error:', error)
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
    default:
      // Check for email confirmation related errors
      if (error.message.toLowerCase().includes('confirm') ||
          error.message.toLowerCase().includes('verify') ||
          error.message.toLowerCase().includes('email')) {
        return 'EMAIL_NOT_CONFIRMED'
      }
      return error.message || 'An unexpected error occurred. Please try again.'
  }
}
