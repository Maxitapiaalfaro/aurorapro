/**
 * Firebase Auth Providers — Aurora
 *
 * Helper functions for social/phone authentication using Firebase Auth.
 * Supports Google, Apple, and Phone Number sign-in.
 *
 * Each function calls the corresponding Firebase Auth method and returns
 * the UserCredential. Errors bubble up to the caller (AuthGate component)
 * which maps Firebase error codes to user-friendly Spanish messages.
 *
 * @module lib/auth-providers
 */

import {
  GoogleAuthProvider,
  OAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type ApplicationVerifier,
} from 'firebase/auth'
import { auth } from '@/lib/firebase-config'

// ────────────────────────────────────────────────────────────────────────────
// Google Sign-In
// ────────────────────────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider()
// Request email scope (default) — no extra scopes needed for auth-only flow.
googleProvider.setCustomParameters({ prompt: 'select_account' })

/**
 * Sign in with Google via popup.
 * Falls back to redirect automatically if popup is blocked (mobile browsers).
 */
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

// ────────────────────────────────────────────────────────────────────────────
// Apple Sign-In
// ────────────────────────────────────────────────────────────────────────────

const appleProvider = new OAuthProvider('apple.com')
appleProvider.addScope('email')
appleProvider.addScope('name')
appleProvider.setCustomParameters({ locale: 'es_CL' })

/**
 * Sign in with Apple via popup.
 */
export async function signInWithApple() {
  return signInWithPopup(auth, appleProvider)
}

// ────────────────────────────────────────────────────────────────────────────
// Phone Number Sign-In (2-step: send code → verify code)
// ────────────────────────────────────────────────────────────────────────────

let recaptchaVerifier: RecaptchaVerifier | null = null

/**
 * Initialize invisible reCAPTCHA for phone auth.
 * Must be called once before `sendPhoneVerificationCode`.
 * The container element must exist in the DOM.
 *
 * @param containerId - DOM element ID for the invisible reCAPTCHA widget
 */
export function initRecaptcha(containerId: string): ApplicationVerifier {
  // Clear any previous verifier to avoid "reCAPTCHA already rendered" errors
  if (recaptchaVerifier) {
    recaptchaVerifier.clear()
    recaptchaVerifier = null
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved — phone sign-in will proceed
    },
  })

  return recaptchaVerifier
}

/**
 * Send SMS verification code to the given phone number.
 *
 * @param phoneNumber - E.164 format (e.g., "+56912345678")
 * @param verifier - The ApplicationVerifier from `initRecaptcha`
 * @returns ConfirmationResult to verify the code later
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  verifier: ApplicationVerifier,
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber, verifier)
}

/**
 * Verify the SMS code entered by the user.
 *
 * @param confirmationResult - The result from `sendPhoneVerificationCode`
 * @param code - 6-digit verification code entered by the user
 */
export async function verifyPhoneCode(
  confirmationResult: ConfirmationResult,
  code: string,
) {
  return confirmationResult.confirm(code)
}

/**
 * Cleanup reCAPTCHA verifier (call on component unmount).
 */
export function cleanupRecaptcha() {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear()
    recaptchaVerifier = null
  }
}
