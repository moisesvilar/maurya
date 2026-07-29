/**
 * Helper del desplegable de información técnica de la grabación (SPEC-059).
 *
 * Desde SPEC-059 la latencia STT y las rutas del WAV/transcript ya no están
 * bajo la cabecera: viven al final de la página, dentro de un Collapsible
 * PLEGADO por defecto. Mientras está plegado, Radix conserva el contenedor
 * (hidden) pero desmonta sus hijos, así que cualquier aserción sobre esas
 * métricas tiene que desplegarlo antes.
 *
 * Las suites anteriores a SPEC-059 usaban la ruta del WAV como acreditación del
 * estado Grabada; siguen haciéndolo, pero pasando por aquí (derogación
 * POSICIONAL, no debilitamiento: se asertan las mismas métricas con el mismo
 * contenido, un click más allá).
 */
import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Literal del trigger, constante en ambos estados (el chevron indica el plegado). */
export const TECH_INFO_TRIGGER = 'Mostrar información técnica de la grabación'

/**
 * Despliega la información técnica y devuelve su contenido. El trigger solo
 * existe en el estado Grabada, así que se espera a que aparezca (la entrevista
 * puede resolverse de forma asíncrona).
 */
export async function expandTechInfo(user: UserEvent): Promise<HTMLElement> {
  await user.click(await screen.findByTestId('recording-tech-info-trigger'))
  return await screen.findByTestId('recording-tech-info-content')
}
