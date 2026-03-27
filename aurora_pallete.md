De acuerdo. Esta es la versión definitiva y autocontenida del plan. Es el mapa de ruta oficial para la implementación visual de Aurora v1.

Blueprint de Implementación v1.0: Rebranding Visual de Aurora
Autor: Mike Krieger, CPO

Fecha: 14 de Octubre, 2025

Estado: Activo - Plan Maestro para la v1

1. Visión y Principios Guía
Objetivo: Implementar la identidad visual fundacional de Aurora. Esta guía es la única fuente de verdad para la refactorización visual.

Principios Clave:

Instrumento Silencioso: La interfaz debe ser un entorno de trabajo sereno, profesional y enfocado. Cada decisión de diseño debe servir para reducir la carga cognitiva del clínico.

Lienzo Blanco (White Canvas): El fondo principal del área de chat, el espacio detrás de las burbujas de conversación, será siempre blanco (Cloud White). Esto proporciona un contraste limpio y una base consistente para que los elementos dinámicos destaquen.

Tematización Dinámica por Agente: Esta es una característica central de la UX de Aurora. La interfaz del chat debe cambiar dinámicamente para reflejar la faceta (agente) que está activa o respondiendo. Este cambio no es solo un badge; afecta a los fondos de las burbujas de mensajes, los bordes, el color del texto, los indicadores de estado y los elementos de la barra de entrada.

2. La Paleta de Colores de Aurora (Fuente de Verdad)
Esta es la paleta oficial y completa que se implementará.

Paleta Primaria (Neutros):

Cloud White (#F8F9FA): Fondo principal del lienzo de la aplicación.

Deep Charcoal (#343A40): Texto principal.

Mineral Gray (#6C757D): Texto secundario, íconos inactivos, placeholders.

Ash (#E9ECEF): Bordes, divisores, fondos de elementos inactivos.

Paleta de Acentos de Faceta (Agentes):

Memoria (Documentación): Serene Teal (#20C997) - Hereda el color principal de la marca.

Perspectiva (Análisis): Clarity Blue (#0D6EFD) - Azul sereno para el análisis profundo.

Evidencia (Investigación): Academic Plum (#6F42C1) - Púrpura sobrio para el rigor académico.

3. Plan de Implementación por Fases
Fase 1: La Fundación (Configuración del Sistema de Diseño)
Establecemos la base técnica para la nueva identidad visual.

Tarea 1.1: Actualizar tailwind.config.js

Qué: Traducir la paleta de colores completa a la configuración de Tailwind.

Cómo: Crear nombres semánticos para cada color y sus variantes (ej: serene-teal-50, serene-teal-100... serene-teal-900). Esto incluye los neutros y los tres colores de acento de las facetas.

Por qué: Centraliza nuestros estilos, garantiza la consistencia y facilita futuras actualizaciones.

Tarea 1.2: Refactorizar el Objeto agentVisuals

Qué: Actualizar el archivo de configuración de los agentes para que se convierta en el motor de la tematización dinámica usando la nueva paleta.

Cómo:

Renombrar las claves: socratico → perspectiva, clinico → memoria, academico → evidencia.

Reemplazar todas las clases de Tailwind con las nuevas definiciones.

perspectiva usará la gama clarity-blue.

memoria usará la gama serene-teal.

evidencia usará la gama academic-plum.

orquestador y desconocido usarán la gama neutra (gray, stone).

Asegurar que todas las propiedades (bgColor, textColor, borderColor, typingDotColor, button, etc.) estén correctamente mapeadas.

Por qué: Este objeto es el corazón de la experiencia dinámica. Una correcta implementación aquí asegura que el 80% de la tematización del chat funcione de manera automática y consistente.

Fase 2: El Corazón de la Experiencia (Interfaz de Chat)
Implementamos la tematización dinámica en los componentes de la conversación.

Tarea 2.1: Adaptar MainInterfaceOptimized.tsx y ChatInterface.tsx

Qué: Establecer el fondo del lienzo y asegurar que el contenedor del chat gestione correctamente el tema del agente activo.

Cómo:

En MainInterfaceOptimized.tsx o un layout superior, establece el fondo global en bg-cloud-white.

En ChatInterface.tsx, la lógica que renderiza las burbujas de mensajes debe obtener toda la información de estilo (fondos, bordes, texto) exclusivamente de la función getAgentVisualConfigSafe(message.agent).

Por qué: Esto asegura que el "Lienzo Blanco" sea la base y que el contenedor del chat esté listo para aplicar los estilos dinámicos que recibe de la configuración.

Tarea 2.2: Refinar la Burbuja de Mensaje y su Contenido

Qué: Garantizar que cada burbuja de mensaje y todo su contenido se adapten visualmente al agente que la emite.

Cómo:

Contenedor del Mensaje: Su bgColor, textColor, y borderColor deben ser controlados por agentVisuals.

MarkdownRenderer.tsx: Debe ser agnóstico al color. No debe tener clases de color de texto hardcodeadas. Heredará su color de texto (deep-charcoal o una variante) del contenedor del mensaje. Los enlaces (<a>) dentro del Markdown SÍ deben adoptar dinámicamente el color principal del agente activo (ej. text-teal-600, text-blue-600).

Badge del Agente: El pequeño badge que nombra al agente dentro de su burbuja debe usar los estilos de button definidos en agentVisuals para crear un contraste sutil pero claro.

Por qué: La ejecución en este nivel de detalle es lo que crea una experiencia de alta calidad. La coherencia dentro de cada mensaje es fundamental para la usabilidad.

Tarea 2.3: Actualizar la Barra de Entrada (Input Bar)

Qué: Hacer que la barra de entrada también refleje el contexto del agente activo.

Cómo:

El borde del textarea o del contenedor principal de la barra de entrada, especialmente en su estado focus-within, debe adoptar el color principal del agente al que se le está escribiendo. Por ejemplo, focus-within:border-serene-teal-500.

El botón primario de "Enviar" usará bg-serene-teal.

Por qué: Esto refuerza sutilmente al usuario a qué faceta se está dirigiendo, completando el ciclo de la tematización dinámica.

Fase 3: Cohesión Estructural (Componentes Periféricos)
Alineamos el resto de la aplicación con la nueva identidad.

Tarea 3.1: Refactorizar Sidebar.tsx

Qué: Asegurar que el historial de conversaciones y la lista de pacientes reflejen la nueva marca.

Cómo:

Usar la paleta neutra para fondos, textos y estados de selección (ash, mineral-gray).

Crítico: Las insignias o íconos que representan al último agente en una conversación del historial deben usar el color correspondiente de la faceta (serene-teal, clarity-blue, academic-plum), obteniéndolo de agentVisuals.

Por qué: Proporciona consistencia visual y permite al usuario identificar rápidamente el contexto de conversaciones pasadas.

4. Criterios de Éxito para la v1
La implementación se considerará exitosa cuando:

No queden referencias a la paleta de colores anterior (amber, lime, stone) en la base de código.

La interfaz del chat cambie de tema de manera fluida y completa según el agente que responda.

Toda la aplicación presente una apariencia visual unificada bajo la nueva paleta de colores, respetando los principios de diseño.

Todo el texto cumpla con los estándares de accesibilidad de contraste WCAG AA.