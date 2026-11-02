# Raíces · Árbol genealógico

Aplicación web para crear, explorar y compartir tu árbol genealógico, inspirada en la experiencia de apps como MyHeritage, pero **sin servidor, sin cuentas y sin enviar tus datos a nadie**: todo se guarda en tu dispositivo.

Funciona en el navegador del ordenador y del móvil, y se puede instalar en el iPhone/Android como una app (*Compartir → Añadir a pantalla de inicio*).

## Funcionalidades

| Área | Qué hace |
|---|---|
| **Árbol ilustrado** (vista principal) | Inspirado en un póster hecho a mano en casa: la persona y sus hermanos en el tronco, Papá y Mamá en la bifurcación, Abuelitos y Bisabuelos en la copa. Fotos tipo polaroid con etiquetas manuscritas y huecos «¿Abuelita?» para completar. Se dibuja por código, así que se adapta a cualquier familia. |
| **Póster para imprimir** | Descarga el árbol ilustrado como imagen PNG de alta resolución (≈3500 px, apta para A3). En el iPhone se abre el menú de compartir para guardarlo o imprimirlo. |
| **Primeros pasos guiados** | Pantalla "¿Cómo quieres empezar?" (crear, importar GEDCOM o ver ejemplo), introducción breve y asistente paso a paso: tú → madre → padre → abuelos, con apellidos sugeridos y casilla "Vive". Al terminar, mensaje de bienvenida. |
| **Árbol interactivo** | Tarjetas verticales con foto o silueta y botón **+** para añadir familiares; huecos punteados para padres y abuelos que faltan. Vista "reloj de arena": antepasados arriba (hasta 6 generaciones), persona central con hermanos y parejas, descendientes abajo (hasta 5). Arrastrar, rueda/pellizco para zoom, "ver todo" e "inicio". |
| **Fichas** | Nombre, apellidos, sexo, nacimiento y defunción (fecha + lugar), ocupación, foto, notas e historia. |
| **Añadir familiares** | Padre, madre, pareja, hijo/a y hermano/a, desde la ficha o pulsando los huecos "+ Añadir padre/madre". Permite vincular a alguien que **ya está** en el árbol (para unir ramas sin duplicados). |
| **Apellidos sugeridos** | Al añadir un hijo propone *primer apellido del padre + primer apellido de la madre* (costumbre hispana). |
| **Fechas genealógicas** | Acepta `12/03/1950`, `1950`, `marzo 1950`, `c. 1900`, `antes de 1880`, `entre 1900 y 1910`… y las guarda en formato GEDCOM. |
| **Calculadora de parentesco** | "¿Qué es X de Y?": padre, bisabuelo, tío abuelo, primo segundo, medio hermano, suegro, cuñado… con el camino familiar y el ancestro común. |
| **GEDCOM** | Importa y exporta GEDCOM 5.5.1, el estándar de **MyHeritage, Ancestry, FamilySearch, Geni, Gramps**. Puedes traer tu árbol de MyHeritage y llevártelo de vuelta. |
| **Compartir con privacidad** | Exportación GEDCOM que muestra a las personas vivas como «Privado» (sin nombre, fechas, lugares ni fotos). |
| **Copia de seguridad** | Exporta/restaura JSON (incluye las fotos). |
| **Estadísticas** | Personas, familias, generaciones, apellidos y lugares más frecuentes, nacimientos por siglo, esperanza de vida media. |
| **Otros** | Búsqueda, lista de personas filtrable, impresión/PDF, modo oscuro, funciona sin conexión (PWA). |

### Cómo traer tu árbol desde MyHeritage

1. En MyHeritage (web): *Árbol genealógico → Gestionar árboles → Exportar a GEDCOM*.
2. Descarga el archivo `.ged` que te envían.
3. En Raíces: menú **⋮ → Importar GEDCOM…**
4. Busca tu nombre y pulsa **Hacer inicio**.

Las fotos de MyHeritage se importan si el GEDCOM trae sus URLs; las que subas en Raíces se guardan en el dispositivo y solo viajan en la *copia de seguridad* JSON.

## Qué NO hace (y por qué)

Ser honestos con el alcance evita expectativas falsas:

- **ADN**: requiere laboratorio, kits y una base de datos de millones de perfiles. No es replicable con software.
- **Búsqueda en registros históricos y "Smart Matches"**: el valor de MyHeritage está en miles de millones de registros con licencia. Aquí no hay base de datos externa.
- **Colaboración multiusuario y nube**: hoy los datos son locales. Es el siguiente paso natural (ver hoja de ruta).

## Uso

No necesita instalación ni compilación. Basta un servidor estático (los módulos ES no cargan con `file://`):

```bash
npm start            # = python3 -m http.server 8080
# abre http://localhost:8080
```

Tests (Node 20+):

```bash
npm test
```

### Publicarlo en Internet (gratis) con GitHub Pages

El workflow `.github/workflows/pages.yml` ejecuta los tests y publica la app en cada push a `main`. Solo hay que activarlo una vez:
*Settings → Pages → Build and deployment → Source: **GitHub Actions***.
La URL será `https://<usuario>.github.io/repo_arbol_genealogico/`.

## Arquitectura

HTML + CSS + JavaScript (módulos ES) sin dependencias ni paso de compilación.

```
index.html            Estructura de la interfaz e iconos SVG
css/styles.css        Estilos (claro/oscuro, escritorio y móvil)
js/store.js           Modelo de datos (personas + familias, igual que GEDCOM), relaciones y estadísticas
js/layout.js          Cálculo de posiciones del árbol (antepasados, hermanos, parejas, descendientes)
js/gedcom.js          Importación / exportación GEDCOM 5.5.1
js/relationship.js    Calculadora de parentesco en español
js/dates.js           Fechas genealógicas (entrada en español ↔ GEDCOM)
js/sample.js          Árbol de ejemplo con personas ficticias
js/onboarding.js      Primeros pasos: elección inicial, introducción y asistente guiado
js/avatars.js         Siluetas de avatar para personas sin foto
js/illustrated.js     Árbol ilustrado (tronco, ramas, copa, polaroids) y su cálculo de posiciones
fonts/                Fuente manuscrita Patrick Hand (licencia SIL OFL, incluida para uso sin conexión)
js/app.js             Interfaz: renderizado SVG, paneles, formularios, persistencia
sw.js                 Service worker (uso sin conexión)
tests/                Tests con node:test (modelo, fechas, GEDCOM, parentesco, solapes del dibujo)
```

El modelo `persona` + `familia` (pareja + hijos) es el mismo que usa GEDCOM, lo que hace que importar y exportar no pierda estructura.

## Hoja de ruta sugerida

1. **Sincronización en la nube y compartir con la familia** (p. ej. Supabase/Firebase con autenticación): permite que varios familiares editen el mismo árbol. Es la funcionalidad con más valor tras la actual.
2. **Galería de fotos y documentos por persona** (almacenamiento en IndexedDB o nube).
3. **Más eventos**: bautismo, residencia, emigración, con mapa de lugares.
4. **Detección de duplicados** al importar varios GEDCOM.
5. **Asistente con IA** para transcribir actas antiguas o redactar biografías a partir de los datos.

## Privacidad

Los datos se guardan en el `localStorage` del navegador. Si borras los datos del navegador, se pierden: **haz copias de seguridad** periódicas (menú ⋮).
