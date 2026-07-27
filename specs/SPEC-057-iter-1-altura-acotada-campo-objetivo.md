# SPEC-057-iter-1 — El diálogo pasa a tres zonas: cabecera fija, cuerpo scrolleable y pie fijo

## Descripción

Iteración por **defecto de código** detectado en la verificación manual de SPEC-057 sobre la app real. La implementación de la spec base aplica los dos topes con exactitud —el diálogo mide 85 vh y el campo 35 vh— pero por debajo de unos 800 px de alto de ventana el formulario se pinta **fuera** del panel del diálogo, sobre la página de detrás, y los botones Cancelar y Guardar quedan fuera de pantalla. A 608 px el desborde medido es de 99 px.

Lo desencadena la verificación manual del 2026-07-27 sobre los ACs marcados `MANUAL` en `tests/spec-test-map.json`, medida por protocolo de depuración remota contra la app corriendo con datos reales. Ningún test automatizado podía detectarlo: jsdom no calcula layout, que es exactamente el motivo por el que esos criterios se marcaron `MANUAL`.

El cambio: `DialogContent` deja de ser una caja que crece y pasa a ser una **columna de tres zonas** —cabecera fija, cuerpo scrolleable, pie fijo—, de modo que el desbordamiento deja de ser accidental y lo absorbe el cuerpo, único elemento que scrollea. El pie queda anclado por construcción y no por confiar en que quepa.

No cambia el criterio de fondo acordado en la ronda 1 —el andamiaje del formulario no se mueve y el campo de objetivo conserva su tope de 35 vh con scroll propio—, ni los textos, ni el estado, ni la validación, ni la persistencia, ni los contratos IPC. Los ACs de SPEC-057 siguen todos vigentes: esta iteración los hace cumplirse, y solo deroga la parte del UX Design de la base que describía el tope del diálogo como un mecanismo sin scroll.

## Diseño / mockups

Artifact de la ronda 2, con las dos variantes evaluadas y la tabla de medidas del defecto: <https://claude.ai/code/artifact/4324dcf5-2f68-4294-8440-8177951a3583>

Artifact de la ronda 1, que esta iteración corrige parcialmente: <https://claude.ai/code/artifact/edfc0d89-d404-4acf-850c-ac2dfbec7d09>

## Alcance de implementación

- Esta iteración define **únicamente el código de producción** del delta: la reestructuración de `DialogContent` en tres zonas y el envoltorio scrolleable de los campos en los tres formularios de objetivo.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- **No hay cambios de infraestructura**: ni schema, ni migración, ni persistencia (`db.json` intacto), ni canales IPC, ni tipos compartidos, ni `package.json`. El delta es exclusivamente de layout en el renderer.
- **Fuera de alcance** (solo el delta): no se toca `src/renderer/src/components/ui/textarea.tsx`, que la base ya excluía; no se migra `DiscardReasonsDialog` al patrón de tres zonas, porque ya resuelve su desbordamiento con su propio `max-h-[50vh] overflow-y-auto` y cambiarlo introduciría un scroll anidado sin motivo; y no se altera el tope de 35 vh de los campos de objetivo.

## Defecto a corregir

### Síntoma

Con un objetivo largo y una ventana de menos de ~800 px de alto, el contenido del formulario se dibuja por debajo del borde inferior del panel del diálogo, superponiéndose a la página de fondo, y los botones de acción quedan fuera del área visible. Medido sobre el grupo real «Exploratory» del discovery «Problem-Solution Fit - MDR»:

| Alto de ventana | Caja del diálogo | Alto real del formulario | Desborde | Botón Guardar |
| --- | --- | --- | --- | --- |
| 608 px | 517 px | 533 px | 99 px | fuera de pantalla |
| 700 px | 595 px | 565 px | 53 px | visible, pero pintado fuera del panel |
| 800 px | 680 px | 600 px | 3 px | correcto |
| 900 px y más | 719 px | 635 px | 0 px | correcto |

Ningún test de `tests/spec-test-map.json` falla: los criterios afectados (AC-03, AC-14, AC-15 de la base) están marcados `MANUAL` precisamente porque jsdom no puede evaluarlos.

### Causa raíz

En `src/renderer/src/components/ui/dialog.tsx`, `DialogContent` combina `grid` con `max-h-[85vh]` y sin `overflow`. Dos efectos se suman:

Primero, `max-height` limita la caja del contenedor pero **no obliga a sus descendientes a encoger**; sin `overflow`, el contenido que no cabe simplemente se pinta fuera de los límites del panel en lugar de recortarse o generar scroll.

Segundo, y es la parte que no se deduce leyendo el código: al ser `display: grid` con filas implícitas de tamaño `auto`, las filas se dimensionan por su contenido y **no encogen** aunque el contenedor tenga una altura máxima definida. Poner `min-height: 0` en el formulario no basta mientras el contenedor siga siendo una retícula con filas automáticas. Se verificó empíricamente: con `grid`, el prototipo seguía dejando «Guardar» fuera a 380, 500, 608 y 700 px; al cambiar el contenedor a columna flex, pasó a comportarse correctamente en todo el rango de 380 a 1100 px.

En consecuencia, el AC-15 de la base —«el campo Objetivo cede altura proporcionalmente y los botones siguen visibles»— nunca llegó a implementarse: nada en el código le indicaba al campo que debía encoger.

### Cambio requerido

En `src/renderer/src/components/ui/dialog.tsx`, `DialogContent` pasa de `grid` a columna flex y recorta lo que sobre:

- Antes: `grid max-h-[85vh] w-full … gap-4 … p-6`
- Después: `flex max-h-[85vh] w-full flex-col overflow-hidden … gap-4 … p-6`

En los tres formularios de objetivo, el elemento `<form>` se convierte en la columna que llena el diálogo y agrupa sus campos en un contenedor scrolleable, dejando el `DialogFooter` fuera de ese contenedor pero dentro del formulario, para que Enter siga enviando de forma nativa:

- El `<form>` añade `min-h-0 flex-1` a sus clases actuales.
- Los campos quedan envueltos en un `<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">`.
- El `DialogFooter` queda como último hijo directo del `<form>`, hermano de ese contenedor.

Ficheros: `InterviewGroupFormDialog.tsx`, `DiscoveryNameDialog.tsx` y `ObjectiveOverrideDialog.tsx`, todos en `src/renderer/src/components/`.

## UX Design — ajuste puntual

La sección «Wireframe textual» del UX Design de SPEC-057 se ajusta **solo** en su bullet del contenedor de diálogo y mantiene todos los demás: la composición de los tres formularios, sus campos, etiquetas literales, placeholders y el tope de 35 vh del campo de objetivo siguen exactamente igual.

El bullet original decía:

> **Contenedor de diálogo (los tres)**: altura máxima el 85 % de la altura de la ventana. Sin scroll propio: es un tope de seguridad para que en ventanas bajas el diálogo entero quepa, cediendo altura al campo de texto.

Ese texto **queda obsoleto y debe entenderse derogado** por esta iteración. El comportamiento esperado del implementador y de la suite QA es el del bullet nuevo:

> **Contenedor de diálogo (los tres)**: altura máxima el 85 % de la altura de la ventana, organizado en tres zonas verticales. La **cabecera** (título y botón de cerrar) queda fija arriba. El **cuerpo** contiene todos los campos y es el único elemento que desplaza: aparece barra de desplazamiento propia solo cuando el conjunto de campos no cabe en la altura disponible. El **pie** con Cancelar y Guardar queda fijo abajo. Nada se dibuja fuera del panel. Con altura de ventana suficiente el diálogo se ajusta a su contenido y no aparece ninguna barra de desplazamiento en el cuerpo.

### Patrón de interacción

Se añade al patrón de la base: **el desbordamiento se absorbe en el cuerpo, nunca en la ventana**. La jerarquía de desplazamiento queda en dos niveles y en este orden: primero el campo de objetivo dentro de su tope de 35 vh, y solo si aun así el formulario no cabe, el cuerpo del diálogo. El segundo nivel únicamente aparece en ventanas bajas, donde ninguna solución evita un coste; a cambio, cabecera y pie permanecen accesibles en todo momento, que es el requisito de partida.

La cabecera queda fija en lugar de desplazarse con el cuerpo para que el botón de cerrar siga siendo alcanzable en ventanas bajas; cuesta una línea de altura.

### Comportamiento responsive

Sustituye a la sección equivalente de la base, que asumía que el campo cedería altura:

- **Ventana baja (≈380–700 px)**: el diálogo alcanza su tope del 85 %, el campo de objetivo alcanza el suyo del 35 % y el cuerpo muestra barra de desplazamiento. Cabecera, pie y ambos botones permanecen visibles y dentro del panel.
- **Ventana media (≈700–900 px)**: el cuerpo deja de desplazarse en algún punto de este rango; el resto es idéntico.
- **Ventana alta (900 px o más)**: ni el diálogo ni el cuerpo alcanzan sus topes; el diálogo se ajusta a su contenido y solo el campo de objetivo desplaza internamente. Indistinguible del comportamiento actual en uso habitual.

### Accesibilidad

El contenedor scrolleable del cuerpo debe ser alcanzable por teclado para que el contenido oculto sea accesible sin ratón; al recibir foco por tabulación un control interno, el navegador lo desplaza a la vista dentro del cuerpo. Radix conserva el atrapamiento de foco del diálogo, que no se altera. Se mantiene el foco inicial al campo «Nombre».

## Notas técnicas

- **Fichero afectado principal**: `src/renderer/src/components/ui/dialog.tsx`, componente `DialogContent`. El cambio `grid` → `flex flex-col` **afecta a todos los diálogos de la aplicación**, no solo a los tres de objetivo. Con hijos apilados y `gap-4`, la retícula de una columna y la columna flex producen el mismo resultado visual, de modo que los diálogos cortos no deberían variar; la regresión posible es visual y solo la cubre la verificación manual.
- **Qué se mantiene explícitamente**: el tope `max-h-[35vh]` con `overflow-y-auto` de los tres campos de objetivo; los atributos `rows` y el `min-h-16` del `Textarea` base; el asa de redimensionar; el `sm:max-w-lg` y el margen lateral del diálogo; el `data-testid` `group-objective-textarea`; y el `objective-override-comment` sin renombrar.
- **`DiscardReasonsDialog` no se migra**: resuelve su desbordamiento con `max-h-[50vh] overflow-y-auto` en su contenedor interno y seguirá funcionando bajo el contenedor flex. Migrarlo al patrón de tres zonas anidaría un segundo scroll sin ganancia.
- **Datos y schema**: sin impacto. No hay cambios en `db.json`, ni en canales IPC, ni en tipos de `src/renderer/src/types/`, ni en main o preload.
- **i18n y tracking**: sin impacto; no se añade ni modifica ningún texto visible.
- **Retrocompatibilidad**: total. No hay migración ni datos que reinterpretar; un usuario con objetivos ya guardados los ve igual, y los objetivos se guardan íntegros como hasta ahora.
- **Dependencias**: SPEC-057 (base). No depende de ninguna otra spec ni la bloquea.

### Verificación manual sugerida

1. Abrir un grupo con objetivo largo y reducir la ventana a unos 380 px de alto: comprobar que título, botón de cerrar, Cancelar y Guardar siguen visibles y dentro del panel, y que nada se dibuja sobre la página de fondo.
2. Desplazar el cuerpo del diálogo y comprobar que cabecera y pie no se mueven, y que el campo de objetivo sigue desplazando por dentro con su propio tope.
3. Ampliar la ventana por encima de 900 px y comprobar que desaparece la barra de desplazamiento del cuerpo y el diálogo vuelve a ajustarse a su contenido.
4. Abrir dos diálogos cortos cualesquiera de la app —por ejemplo el de confirmación de borrado y el de nueva entrevista— y comprobar que su aspecto no ha cambiado tras el paso de `grid` a `flex`.

## Decisiones asumidas

- Variante del tope del campo → asumida **B: se mantiene `max-h-[35vh]`** en los tres campos, aceptando dos niveles de desplazamiento en ventanas bajas (alternativa: A, retirar el tope y dejar un único scroll en el cuerpo). Razón: conserva lo ya validado en la ronda 1 —los Selects quedan a mano sin recorrer el objetivo entero— y el segundo nivel solo aparece por debajo de ~700 px. Recomendación explícita al humano, que delegó la decisión.
- Comportamiento de la cabecera → asumida **fija**, no desplazable con el cuerpo (alternativa: incluirla en la zona scrolleable). Razón: cuesta una línea y mantiene el botón de cerrar accesible en ventanas bajas.
- Alcance del patrón → asumido **`DialogContent` compartido**, con `DiscardReasonsDialog` intacto (alternativa: aplicar el patrón solo a los tres formularios de objetivo mediante una prop o una variante). Razón: introducir una variante en la primitiva para tres consumidores añade superficie de API sin necesidad, dado que el cambio es visualmente neutro para diálogos cortos.
- Validación previa del diseño → asumido **prototipar y medir sobre la app real antes de escribir código** (alternativa: implementar directamente). Razón: la ronda 1 falló por razonar el layout en vez de medirlo, y la causa real —que `grid` impide el encogimiento— no era deducible del código.
