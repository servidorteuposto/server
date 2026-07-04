import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isAdminUser } from '../lib/admin'
import { getMySubscription, type SubscriptionStatus } from '../lib/subscription'
import { supabase } from '../lib/supabase'
import { shouldExpireSessionAfterAbsence, startTabSession } from '../lib/session'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  async function loadSubscription(currentUser: User | null) {
    if (isAdminUser(currentUser)) {
      setIsAdmin(true)
      setSubscriptionStatus('active')
      setIsReadOnly(false)
      return
    }

    setIsAdmin(false)

    try {
      const subscription = await getMySubscription()
      if (subscription.found && subscription.subscription_status) {
        if (subscription.subscription_status === 'pending_payment') {
          await supabase.auth.signOut()
          setSession(null)
          setUser(null)
          setSubscriptionStatus(null)
          setIsReadOnly(false)
          return
        }

        setSubscriptionStatus(subscription.subscription_status)
        setIsReadOnly(Boolean(subscription.is_read_only))
      } else {
        setSubscriptionStatus(null)
        setIsReadOnly(false)
      }
    } catch {
      setSubscriptionStatus(null)
      setIsReadOnly(false)
    }
  }

  useEffect(() => {
    let stopTabSession: (() => void) | null = null

    async function initAuth() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (currentSession && shouldExpireSessionAfterAbsence()) {
        await supabase.auth.signOut()
        setSession(null)
        setUser(null)
        setSubscriptionStatus(null)
        setIsReadOnly(false)
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setSession(currentSession)
      setUser(currentSession?.user ?? null)

      if (currentSession) {
        stopTabSession = startTabSession()
        await loadSubscription(currentSession.user)
      }

      setLoading(false)
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (stopTabSession) {
        stopTabSession()
        stopTabSession = null
      }

      if (event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        try {
          await supabase.rpc('security_clear_my_login_lockout')
        } catch {
          // ignora falha de desbloqueio
        }
      }

      setSession(nextSession)
      setUser(nextSession?.user ?? null)

      if (nextSession) {
        stopTabSession = startTabSession()
        await loadSubscription(nextSession.user)
      } else {
        setSubscriptionStatus(null)
        setIsReadOnly(false)
        setIsAdmin(false)
      }
    })

    return () => {
      subscription.unsubscribe()
      stopTabSession?.()
    }
  }, [])

  return { user, session, loading, subscriptionStatus, isReadOnly, isAdmin, refreshSubscription: loadSubscription }
}
