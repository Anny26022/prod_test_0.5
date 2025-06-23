import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { AuthService, AuthState, getAuthState } from '../services/authService'
import { supabase } from '../lib/supabase'

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: string | null }>
  signInWithProvider: (provider: 'twitter' | 'google' | 'github') => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  resendVerification: (email: string) => Promise<{ error: string | null }>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  updateProfile: (updates: { email?: string; firstName?: string; lastName?: string }) => Promise<{ error: string | null }>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null
  })
  const [initializing, setInitializing] = useState(true)

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // First, try to get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          setAuthState({
            user: null,
            session: null,
            loading: false,
            error: null
          })
          setInitializing(false)
          return
        }

        if (session) {
          // We have a valid session, user is already in the session
          setAuthState({
            user: session.user,
            session,
            loading: false,
            error: null
          })
          } else {
          // No session found
          setAuthState({
            user: null,
            session: null,
            loading: false,
            error: null
          })
        }

        setInitializing(false)
      } catch (error) {
        setAuthState({
          user: null,
          session: null,
          loading: false,
          error: null
        })
        setInitializing(false)
      }
    }

    initializeAuth()

    // Set a fallback timeout to ensure loading doesn't hang forever
    const fallbackTimer = setTimeout(() => {
      setAuthState(prev => ({
        ...prev,
        loading: false
      }))
      setInitializing(false)
    }, 2000) // 2 second fallback

    return () => clearTimeout(fallbackTimer)
  }, [])

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Don't process events during initial setup
      if (initializing) {
        return
      }

      try {
        if (event === 'SIGNED_OUT') {
          setAuthState({
            user: null,
            session: null,
            loading: false,
            error: null
          })
          return
        }

        if (event === 'SIGNED_IN') {
          if (session) {
            setAuthState({
              user: session.user,
              session: session,
              loading: false,
              error: null
            })
          }
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            setAuthState(prev => ({
              ...prev,
              user: session.user,
              session: session,
              loading: false,
              error: null
            }))
          }
          return
        }

        if (event === 'INITIAL_SESSION') {
          // This should be handled by the initialization above
          return
        }

        // For other events, just update loading state
        setAuthState(prev => ({
          ...prev,
          loading: false
        }))

      } catch (error) {
        setAuthState(prev => ({
          ...prev,
          loading: false,
          error: null
        }))
      }
    })

    return () => subscription.unsubscribe()
  }, [initializing])

  const signIn = async (email: string, password: string) => {
    console.log('🔐 AuthContext signIn called for:', email)
    setAuthState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const { data, error } = await AuthService.signIn({ email, password })

      if (error) {
        console.error('❌ AuthService returned error:', error.message)
        // Don't update auth state on error - keep user in current state
        setAuthState(prev => ({ ...prev, loading: false }))
        return { error: error.message }
      }

      console.log('✅ AuthService sign in successful')
      // Auth state will be updated by the onAuthStateChange listener
      // Don't update loading here - let the auth state change handle it
      return { error: null }
    } catch (error) {
      console.error('❌ Unexpected error in AuthContext signIn:', error)
      const errorMessage = 'An unexpected error occurred during sign in'
      setAuthState(prev => ({ ...prev, loading: false }))
      return { error: errorMessage }
    }
  }

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const { data, error } = await AuthService.signUp({ email, password, firstName, lastName })

      if (error) {
        setAuthState(prev => ({ ...prev, loading: false, error: error.message }))
        return { error: error.message }
      }

      // For email confirmation flow, user won't be immediately signed in
      setAuthState(prev => ({ ...prev, loading: false }))
      return { error: null }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred during sign up'
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }))
      return { error: errorMessage }
    }
  }

  const signInWithProvider = async (provider: 'twitter' | 'google' | 'github') => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const { data, error } = await AuthService.signInWithProvider(provider)

      if (error) {
        setAuthState(prev => ({ ...prev, loading: false, error: error.message }))
        return { error: error.message }
      }

      // OAuth will redirect, so we don't need to update state here
      return { error: null }
    } catch (error) {
      const errorMessage = `An unexpected error occurred during ${provider} sign in`
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }))
      return { error: errorMessage }
    }
  }

  const signOut = async () => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }))

    try {
      await AuthService.signOut()
      // Auth state will be updated by the onAuthStateChange listener
    } catch (error) {
      setAuthState(prev => ({ ...prev, loading: false, error: 'Failed to sign out' }))
    }
  }

  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await AuthService.resetPassword(email)

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    } catch (error) {
      return { error: 'An unexpected error occurred while resetting password' }
    }
  }

  const resendVerification = async (email: string) => {
    try {
      const { data, error } = await AuthService.resendVerification(email)

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    } catch (error) {
      return { error: 'An unexpected error occurred while resending verification email' }
    }
  }

  const updatePassword = async (newPassword: string) => {
    try {
      const { data, error } = await AuthService.updatePassword(newPassword)

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    } catch (error) {
      return { error: 'An unexpected error occurred while updating password' }
    }
  }

  const updateProfile = async (updates: { email?: string; firstName?: string; lastName?: string }) => {
    try {
      const { data, error } = await AuthService.updateProfile(updates)

      if (error) {
        return { error: error.message }
      }

      // Refresh auth state to get updated user data
      const state = await getAuthState()
      setAuthState(state)

      return { error: null }
    } catch (error) {
      return { error: 'An unexpected error occurred while updating profile' }
    }
  }

  const refreshSession = async () => {
    try {
      await AuthService.refreshSession()
      const state = await getAuthState()
      setAuthState(state)
    } catch (error) {
      }
  }

  const contextValue: AuthContextType = {
    ...authState,
    signIn,
    signUp,
    signInWithProvider,
    signOut,
    resetPassword,
    resendVerification,
    updatePassword,
    updateProfile,
    refreshSession
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper hooks for common auth checks
export const useUser = (): User | null => {
  const { user } = useAuth()
  return user
}

export const useSession = (): Session | null => {
  const { session } = useAuth()
  return session
}

export const useIsAuthenticated = (): boolean => {
  const { user, session } = useAuth()
  return !!(user && session)
}

export const useAuthLoading = (): boolean => {
  const { loading } = useAuth()
  return loading
}
