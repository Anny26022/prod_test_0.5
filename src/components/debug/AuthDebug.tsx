import React, { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

export const AuthDebug: React.FC = () => {
  const { user, session, loading, error } = useAuth()
  const [localStorageSession, setLocalStorageSession] = useState<any>(null)

  useEffect(() => {
    // Check what's in localStorage
    const checkLocalStorage = () => {
      try {
        const stored = localStorage.getItem('supabase.auth.token')
        setLocalStorageSession(stored ? JSON.parse(stored) : null)
      } catch (e) {
        setLocalStorageSession('error parsing')
      }
    }

    checkLocalStorage()
    const interval = setInterval(checkLocalStorage, 1000)
    return () => clearInterval(interval)
  }, [])

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs max-w-sm z-50 max-h-96 overflow-y-auto">
      <h3 className="font-bold mb-2">Auth Debug</h3>
      <div className="space-y-1">
        <div>Loading: {loading ? 'true' : 'false'}</div>
        <div>User: {user ? user.email : 'null'}</div>
        <div>Session: {session ? 'exists' : 'null'}</div>
        <div>Session Expires: {session ? new Date(session.expires_at! * 1000).toLocaleString() : 'n/a'}</div>
        <div>Error: {error || 'none'}</div>
        <div>LocalStorage: {localStorageSession ? 'exists' : 'null'}</div>
        <div>Timestamp: {new Date().toLocaleTimeString()}</div>
        <button
          onClick={async () => {
            const { data } = await supabase.auth.getSession()
            }}
          className="mt-2 px-2 py-1 bg-blue-600 rounded text-xs"
        >
          Check Session
        </button>
      </div>
    </div>
  )
}
