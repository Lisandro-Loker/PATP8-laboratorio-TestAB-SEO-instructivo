import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { registerImpressionInDb } from '@/lib/db'
import {
  COOKIE,
  SESSION_WINDOW,
  THIRTY_DAYS,
  assignVariant,
  cookieOptions,
  isVariant,
  type Variant,
} from '@/lib/experiment'

const BOT_REGEX =
  /bot|crawler|spider|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebot|ia_archiver/i

export async function proxy(request: NextRequest) {
  // 1. El modo ?preview=a|b no escribe cookies ni suma impresiones
  const previewParam = request.nextUrl.searchParams.get('preview')
  if (isVariant(previewParam)) {
    return NextResponse.next()
  }

  // 2. Ignorar prefetches automáticos del router
  const isPrefetch =
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('next-router-prefetch') === '1'
  if (isPrefetch) {
    return NextResponse.next()
  }

  // 3. Si es un crawler/bot sin sesión, dejar fijo el control 'a' sin inflar conteos
  const userAgent = request.headers.get('user-agent') ?? ''
  if (BOT_REGEX.test(userAgent)) {
    return NextResponse.next()
  }

  const secure = request.nextUrl.protocol === 'https:'
  const existingVisitor = request.cookies.get(COOKIE.visitor)?.value?.trim()
  const visitorId = existingVisitor || crypto.randomUUID()

  // Derivación determinística siempre a partir del visitorId
  const variant: Variant = assignVariant(visitorId)

  // Propagar las cookies al request actual para que el primer render SSR ya tenga la variante
  request.cookies.set(COOKIE.visitor, visitorId)
  request.cookies.set(COOKIE.variant, variant)

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Persistir visitante y variante por 30 días
  response.cookies.set(
    COOKIE.visitor,
    visitorId,
    cookieOptions(secure, THIRTY_DAYS)
  )
  response.cookies.set(
    COOKIE.variant,
    variant,
    cookieOptions(secure, THIRTY_DAYS)
  )

  // 4. Registrar a lo sumo una impresión por ventana de sesión de 30 minutos
  const alreadyImpressedInCookie = request.cookies.get(COOKIE.impressed)?.value
  if (!alreadyImpressedInCookie) {
    await registerImpressionInDb(visitorId, variant)
    response.cookies.set(
      COOKIE.impressed,
      '1',
      cookieOptions(secure, SESSION_WINDOW)
    )
  }

  return response
}

export const config = {
  matcher: ['/practica'],
}