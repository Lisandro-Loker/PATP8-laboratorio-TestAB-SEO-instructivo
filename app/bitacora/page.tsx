import type { Metadata } from 'next'
import Link from 'next/link'
import { getExperimentLog } from '@/lib/db'
import {
  HASH_EXAMPLE_ID,
  TEST_CASE,
  VARIANTS,
  assignVariant,
  conversionRate,
  formatCount,
  formatPoints,
  formatRate,
  rateGap,
  type Variant,
} from '@/lib/experiment'

export const metadata: Metadata = {
  title: 'Bitácora',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const ROWS: Variant[] = ['a', 'b']

export default async function BitacoraPage() {
  const liveLog = await getExperimentLog()
  const demoVariantFirst = assignVariant(HASH_EXAMPLE_ID)
  const demoVariantRepeat = assignVariant(HASH_EXAMPLE_ID)

  return (
    <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
      <p className="font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground uppercase">
        Bitácora del experimento · Medición activa
      </p>
      <h1 className="max-w-2xl font-serif text-4xl tracking-tight text-balance md:text-5xl">
        Métricas de conversión y caso de verificación.
      </h1>
      <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
        La tasa divide conversiones por impresiones. Si una variante aún no registra impresiones, la tasa queda en Pendiente (no es 0%). No se declara ganador.
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Eventos registrados del experimento</h2>
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left text-muted-foreground">
            Conteos persistidos en servidor (1 impresión por sesión de 30 min, 1 conversión por visitante desde el CTA).
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 font-medium">Variante</th>
              <th className="py-2 font-medium">Impresiones</th>
              <th className="py-2 font-medium">Conversiones</th>
              <th className="py-2 font-medium">Tasa</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((variant) => (
              <tr key={variant} className="border-b border-border">
                <td className="py-3">
                  {variant.toUpperCase()} · {VARIANTS[variant].name}
                </td>
                <td className="py-3 font-mono">{formatCount(liveLog[variant].impressions)}</td>
                <td className="py-3 font-mono">{formatCount(liveLog[variant].conversions)}</td>
                <td className="py-3 font-mono">{formatRate(conversionRate(liveLog[variant]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-mono text-sm">B − A = {formatPoints(rateGap(liveLog))}</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Caso de prueba fijo</h2>
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left text-muted-foreground">
            Cohorte fija calculada por fórmula: A da 7,50% (18/240), B da 13,14% (31/236) y la diferencia es 5,64 pp.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 font-medium">Variante</th>
              <th className="py-2 font-medium">Impresiones</th>
              <th className="py-2 font-medium">Conversiones</th>
              <th className="py-2 font-medium">Tasa</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((variant) => (
              <tr key={variant} className="border-b border-border">
                <td className="py-3">
                  {variant.toUpperCase()} · {VARIANTS[variant].name}
                </td>
                <td className="py-3 font-mono">{formatCount(TEST_CASE[variant].impressions)}</td>
                <td className="py-3 font-mono">{formatCount(TEST_CASE[variant].conversions)}</td>
                <td className="py-3 font-mono">{formatRate(conversionRate(TEST_CASE[variant]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-mono text-sm">B − A = {formatPoints(rateGap(TEST_CASE))}</p>
        <p className="font-mono text-sm">
          assignVariant({`'${HASH_EXAMPLE_ID}'`}) → {`'${demoVariantFirst}'`} (repetición estable → {`'${demoVariantRepeat}'`})
        </p>
      </section>

      <Link href="/practica" className="text-sm text-muted-foreground underline">
        Volver a la landing
      </Link>
    </main>
  )
}