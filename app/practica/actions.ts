'use server'

import { cookies, headers } from 'next/headers'
import { registerConversionInDb } from '@/lib/db'
import {
  COOKIE,
  THIRTY_DAYS,
  assignVariant,
  cookieOptions,
  isVariant,
} from '@/lib/experiment'

export type ConversionResult = {
  status: 'converted' | 'already_converted' | 'ignored'
}

export async function recordConversion(): Promise<ConversionResult> {
  const headerStore = await headers()
  const referer = headerStore.get('referer') ?? ''

  // Si está usando el instrumento ?preview=a|b, no cuenta en el experimento
  try {
    if (referer) {
      const refUrl = new URL(referer)
      const preview = refUrl.searchParams.get('preview')
      if (isVariant(preview)) {
        return { status: 'ignored' }
      }
    }
  } catch {
    // Referer relativo o inválido: continuar validación por cookies
  }

  const cookieStore = await cookies()
  const visitorId = cookieStore.get(COOKIE.visitor)?.value?.trim()
  const rawVariant = cookieStore.get(COOKIE.variant)?.value

  if (!visitorId) {
    return { status: 'ignored' }
  }

  const variant = isVariant(rawVariant) ? rawVariant : assignVariant(visitorId)

  if (cookieStore.get(COOKIE.converted)?.value === '1') {
    return { status: 'already_converted' }
  }

  const dbStatus = await registerConversionInDb(visitorId, variant)

  const forwardedProto = headerStore.get('x-forwarded-proto')
  const secure = forwardedProto === 'https'
  cookieStore.set(COOKIE.converted, '1', cookieOptions(secure, THIRTY_DAYS))

  return { status: dbStatus }
}