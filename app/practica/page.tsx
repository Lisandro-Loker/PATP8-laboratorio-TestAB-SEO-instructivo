import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Landing } from '@/components/landing'
import {
  CANONICAL_PATH,
  COOKIE,
  DESCRIPTION_RANGE,
  TITLE_RANGE,
  VARIANTS,
  characterCount,
  inRange,
  isVariant,
  type Variant,
} from '@/lib/experiment'

type PracticaPageProps = {
  searchParams: Promise<{ preview?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata({ searchParams }: PracticaPageProps): Promise<Metadata> {
  const params = await searchParams
  const requested = firstParam(params.preview)
  const preview = isVariant(requested) ? requested : null

  const cookieStore = await cookies()
  const rawVariant = cookieStore.get(COOKIE.variant)?.value
  const assignedVariant: Variant = isVariant(rawVariant) ? rawVariant : 'a'

  const activeVariant: Variant = preview ?? assignedVariant
  const copy = VARIANTS[activeVariant]

  return {
    title: { absolute: copy.seoTitle },
    description: copy.seoDescription,
    alternates: { canonical: CANONICAL_PATH },
    robots: preview
      ? { index: false, follow: false }
      : { index: true, follow: true },
  }
}

export default async function PracticaPage({ searchParams }: PracticaPageProps) {
  const params = await searchParams
  const requested = firstParam(params.preview)
  const preview = isVariant(requested) ? requested : null

  const cookieStore = await cookies()
  const visitorId = cookieStore.get(COOKIE.visitor)?.value
  const rawVariant = cookieStore.get(COOKIE.variant)?.value
  const assignedVariant: Variant = isVariant(rawVariant) ? rawVariant : 'a'

  const variant: Variant = preview ?? assignedVariant
  const copy = VARIANTS[variant]
  const titleLength = characterCount(copy.seoTitle)
  const descriptionLength = characterCount(copy.seoDescription)

  return (
    <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
      <p className="font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground uppercase">
        {preview ? 'Instrumento de preview · noindex' : `Experimento activo · Variante ${variant.toUpperCase()}`}
      </p>
      <p className="border-b border-border pb-4 text-sm text-muted-foreground">
        {preview
          ? `Estás viendo el copy ${preview.toUpperCase()} por query (?preview=${preview}). No pisa la cookie ni suma impresiones, y lleva directiva noindex.`
          : visitorId
            ? `Visitante asignado de forma estable a la variante ${assignedVariant.toUpperCase()} (${VARIANTS[assignedVariant].name}).`
            : 'Sin cookie previa: se exhibe la variante A (Control) por defecto.'}
      </p>
      <Landing variant={variant} />
      <div className="flex flex-wrap gap-2">
        {preview && (
          <Link href="/practica" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
            Salir del preview
          </Link>
        )}
        <Link href="/practica?preview=a" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Ver copy A
        </Link>
        <Link href="/practica?preview=b" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Ver copy B
        </Link>
        <Link href="/bitacora" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Bitácora
        </Link>
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Metadatos publicados en el servidor</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            <dt className="font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase">
              Title de {variant.toUpperCase()}
            </dt>
            <dd>{copy.seoTitle}</dd>
            <dd className="font-mono text-sm text-muted-foreground">
              {titleLength} caracteres · {inRange(titleLength, TITLE_RANGE) ? 'dentro de 50–60' : 'fuera de rango'}
            </dd>
          </div>
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            <dt className="font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase">
              Description de {variant.toUpperCase()}
            </dt>
            <dd>{copy.seoDescription}</dd>
            <dd className="font-mono text-sm text-muted-foreground">
              {descriptionLength} caracteres ·{' '}
              {inRange(descriptionLength, DESCRIPTION_RANGE) ? 'dentro de 140–160' : 'fuera de rango'}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  )
}