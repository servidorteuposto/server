import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isAdminUser } from '../lib/admin'
import { getMySubscription, type SubscriptionStatus } from '../lib/subscription'
import { isImpersonating, supabase } from '../lib/supabase'
import { shouldExpireSessionAfterAbsence, startTabSession } from '../lib/session'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null)
  const [billingMode, setBillingMode] = useState<'one_time' | 'recurring' | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false)
  const [canCancelRecurring, setCanCancelRecurring] = useState(false)
  const [canRequestRefund, setCanRequestRefund] = useState(false)
  const [refundRequestedAt, setRefundRequestedAt] = useState<string | null>(null)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  function clearSubscriptionState() {
    setSubscriptionStatus(null)
    setSubscriptionEndsAt(null)
    setBillingMode(null)
    setDaysLeft(null)
    setCancelAtPeriodEnd(false)
    setCanCancelRecurring(false)
    setCanRequestRefund(false)
    setRefundRequestedAt(null)
    setIsReadOnly(false)
  }

  async function loadSubscription(currentUser: User | null) {
    if (isAdminUser(currentUser)) {
      setIsAdmin(true)
      setSubscriptionStatus('active')
      setSubscriptionEndsAt(null)
      setBillingMode(null)
      setDaysLeft(null)
      setCancelAtPeriodEnd(false)
      setCanCancelRecurring(false)
      setCanRequestRefund(false)
      setRefundRequestedAt(null)
      setIsReadOnly(false)
      return
    }

    setIsAdmin(false)

    try {
      const subscription = await getMySubscription()
      if (subscription.found && subscription.subscription_status) {
        if (subscription.subscription_status === 'pending_payment' && !isImpersonating()) {
          await supabase.auth.signOut()
          setSession(null)
          setUser(null)
          clearSubscriptionState()
          return
        }

        setSubscriptionStatus(subscription.subscription_status)
        setSubscriptionEndsAt(subscription.subscription_ends_at ?? null)
        setBillingMode(subscription.billing_mode ?? null)
        setDaysLeft(
          typeof subscription.days_left === 'number' ? subscription.days_left : null,
        )
        setCancelAtPeriodEnd(Boolean(subscription.cancel_at_period_end))
        setCanCancelRecurring(Boolean(subscription.can_cancel_recurring))
        setCanRequestRefund(Boolean(subscription.can_request_refund))
        setRefundRequestedAt(subscription.refund_requested_at ?? null)
        setIsReadOnly(isImpersonating() ? false : Boolean(subscription.is_read_only))
      } else {
        clearSubscriptionState()
      }
    } catch {
      clearSubscriptionState()
    }
  }

  useEffect(() => {
    let stopTabSession: (() => void) | null = null

    async function initAuth() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (currentSession && shouldExpireSessionAfterAbsence() && !isImpersonating()) {
        await supabase.auth.signOut()
        setSession(null)
        setUser(null)
        clearSubscriptionState()
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
        clearSubscriptionState()
        setIsAdmin(false)
      }
    })

    return () => {
      subscription.unsubscribe()
      stopTabSession?.()
    }
  }, [])

  return {
    user,
    session,
    loading,
    subscriptionStatus,
    subscriptionEndsAt,
    billingMode,
    daysLeft,
    cancelAtPeriodEnd,
    canCancelRecurring,
    canRequestRefund,
    refundRequestedAt,
    isReadOnly,
    isAdmin,
    refreshSubscription: loadSubscription,
  }
}
