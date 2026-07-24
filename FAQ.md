# Preguntas frecuentes (FAQ)

Dudas habituales al instalar y usar **Maurya** en macOS. Si tu problema no está aquí, revisa el [README](README.md).

---

## Instalación y primer arranque

### ¿Qué necesito para ejecutar Maurya?

- **macOS 14.2 o superior.** Pronto estará soportado en otros OS.
- **Mac con Apple Silicon** (arm64). Pronto estará soportado para procesadores Intel.

### La primera vez no me deja abrir la app: dice que está de un desarrollador no identificado

Maurya va firmada **ad-hoc**, sin Developer ID ni certificación de Apple, así que el OS la bloquea el primer arranque. Para abrirla, accede a **Ajustes** > **Privacidad y Seguridad** y en la sección **Seguridad** pulsa en *Abrir igualmente* al lado del mensaje acerca de *Maurya*.

Solo hace falta hacerlo la primera vez; luego se abre con doble clic como cualquier otra app.

---

## Permisos del sistema

### ¿Cómo concedo los permisos de micrófono y de audio del sistema?

Maurya necesita dos permisos para grabar una entrevista: **Micrófono** (tu voz) y **Grabación de pantalla y audio del sistema** (la voz de tu interlocutor en la llamada o reunión).

macOS te los pedirá **la primera vez que inicies una grabación**. Si los rechazaste o quieres revisarlos, concédelos manualmente en **Ajustes del Sistema → Privacidad y seguridad**:

- **Micrófono** → activa **Maurya**.
- **Grabación de pantalla y audio del sistema** → activa **Maurya**.

Desde la propia app, cada aviso de permiso que falta incluye un botón **«Abrir Ajustes del Sistema»** que te lleva directo al panel correspondiente. En la sección de grabación verás además dos indicadores («Micrófono» y «Audio del sistema») en verde **Concedido** o rojo **No concedido**.

### ¿Por qué me pide permiso de «Grabación de pantalla» si solo quiero grabar audio?

Porque macOS no tiene un permiso separado solo para «audio del sistema»: el acceso al audio del sistema se autoriza a través del permiso de **Grabación de pantalla y audio del sistema**. Maurya **no graba tu pantalla**; solo captura el audio. Es la forma que da macOS de conceder ese acceso.

### Concedí los permisos pero la app sigue diciendo que no tengo permiso de micrófono o de audio. ¿Qué hago?

Es un fallo conocido de macOS: a veces el permiso queda «pegado» o corrupto aunque el interruptor aparezca activado. La solución es **quitar y volver a añadir** la app en ese panel de permisos:

1. Abre **Ajustes del Sistema → Privacidad y seguridad**.
2. Entra en el permiso que da problemas (**Micrófono** o **Grabación de pantalla y audio del sistema**).
3. Selecciona **Maurya** en la lista y pulsa el botón **«−»** para quitarla.
4. Pulsa el botón **«+»** para añadirla de nuevo: navega a la carpeta **Aplicaciones** y selecciona **Maurya**.
5. Vuelve a activar el interruptor de Maurya y **reinicia la app**.

Si macOS te pide reiniciar la aplicación tras el cambio, hazlo.

---

## Claves de IA (Deepgram y Anthropic)

### ¿Dónde configuro las claves de Deepgram y Anthropic?

En **Ajustes → Claves de IA**. Pega ahí tu API key de **Deepgram** (transcripción) y la de **Anthropic** (asistente y guiones) y guarda.

Las claves se guardan **cifradas en tu equipo** (Keychain de macOS) y **nunca se vuelven a mostrar**: tras guardarlas verás un indicador «Configurada» con los últimos 4 caracteres. Por seguridad, el campo nunca precarga la clave completa.

### ¿Qué pasa si no configuro las claves?

Maurya sigue funcionando, pero de forma degradada:

- **Sin la clave de Deepgram**: la grabación de audio (WAV) continúa con normalidad, pero **sin transcripción en vivo**.
- **Sin la clave de Anthropic**: el **asistente proactivo queda inerte** (no hace ninguna llamada) y no se generan guiones ni resúmenes.

En cuanto añadas las claves en Ajustes, esas funciones se reactivan.

### No puedo guardar las claves: dice «Cifrado no disponible»

Maurya solo guarda claves si puede cifrarlas con el sistema (Keychain). Si el cifrado del sistema no está disponible, el botón de guardar se deshabilita para **nunca almacenar una clave sin cifrar**. Asegúrate de haber iniciado sesión en tu cuenta de macOS con normalidad y que el Llavero funciona; luego reintenta.

---

## Grabación, audio y transcripción

### ¿Se envían mis grabaciones a la nube? ¿Es privado?

Tus datos (entrevistas, notas, grabaciones) se guardan **en local, en tu Mac**. Ahora bien, para las funciones de IA, el contenido necesario se envía a los servicios externos que las hacen posibles:

- **Deepgram** recibe el audio para transcribirlo en tiempo real.
- **Anthropic (Claude)** recibe la transcripción y el contexto para el guión, el asistente en vivo y el resumen.

Si no configuras las claves de esos servicios, no se envía nada a ellos (pero tampoco tendrás transcripción ni asistente). Tus API keys nunca salen de tu equipo.

### ¿Dónde se guardan las grabaciones y mis datos?

En la carpeta de datos de la app dentro de tu usuario de macOS: `~/Library/Application Support/Maurya/`. Ahí encontrarás las grabaciones de audio (WAV) junto con su transcripción, además de la base de datos local con tus entrevistas, contactos y notas.

### No aparece la transcripción o me da un error de conexión con Deepgram

La transcripción es una función **degradable**: si algo falla, **la grabación de audio nunca se ve afectada** y conservas lo grabado. Comprueba:

- Que la **clave de Deepgram** esté configurada y sea válida (Ajustes → Claves de IA). Una clave inválida da un error de conexión.
- Tu **conexión a internet**: si se pierde, Maurya reintenta reconectar y avisa; si no lo consigue, la captura continúa sin transcripción y conserva las líneas ya recibidas.

### La transcripción no distingue quién habla

Si Deepgram no puede aplicar la atribución de hablante (diarización), Maurya lo detecta y sigue transcribiendo **sin** esa atribución. La transcripción y el asistente siguen funcionando con normalidad; solo se pierde la etiqueta de quién dijo cada línea.

---

## Coste de IA

### ¿Puedo controlar cuánto gasto en IA por entrevista?

Sí. En Ajustes puedes fijar un **límite de coste estimado por entrevista** para el asistente (déjalo vacío para no poner límite). Al alcanzarlo, el asistente se **pausa** —la grabación y la transcripción continúan— y puedes reanudarlo manualmente. En **Ajustes → Modelos de IA** puedes además elegir el modelo de cada tarea para ajustar el equilibrio entre coste y calidad.
