# **Arquitectura Avanzada para Interfaces de Chat con IA: Optimización del Streaming de Contenidos y la Responsividad en Next.js para 2025**

## **I. Resumen Ejecutivo: Un Plan Arquitectónico de Alto Nivel para una Interfaz de Chat con IA en 2025**

### **Planteamiento del Problema**

El desarrollo de plataformas de chat impulsadas por Modelos de Lenguaje Grandes (LLM) presenta un conjunto único de desafíos en la intersección del streaming de datos en tiempo real, el renderizado de contenido dinámico y el diseño responsivo. Una arquitectura actual que depende de un analizador de Markdown tradicional, como markdown-it, es fundamentalmente inadecuada para las exigencias del streaming de respuestas de LLM. Este enfoque conduce a una cascada de fallos sistémicos: un renderizado incorrecto y parpadeante de elementos complejos como tablas, una severa inestabilidad del layout (Cumulative Layout Shift o CLS) que rompe la experiencia de usuario, y un rendimiento deficiente, especialmente pronunciado en dispositivos móviles.

### **Solución Propuesta: Una Estrategia Multicapa**

Este informe detalla una solución holística y moderna construida sobre tres pilares arquitectónicos fundamentales, diseñada para el ecosistema tecnológico de 2025 (Next.js y TypeScript).

1. **Renderizado Nativo para Streaming:** La estrategia principal es reemplazar el analizador de Markdown actual por una biblioteca diseñada específicamente para manejar fragmentos de Markdown incompletos y en streaming. La recomendación principal es **Streamdown** de Vercel, una herramienta que aborda directamente los artefactos visuales generados por el contenido parcial.  
2. **Responsividad Impulsada por Componentes:** Se debe abandonar el paradigma de las media queries basadas en el viewport para el contenido complejo de los mensajes. En su lugar, se adoptarán las **CSS Container Queries** para crear componentes verdaderamente encapsulados y autoadaptables. Este enfoque es crucial para gestionar elementos problemáticos como las tablas, permitiéndoles responder al espacio de su contenedor inmediato en lugar de a la pantalla global.  
3. **Estabilidad y Rendimiento Proactivos:** La arquitectura debe incorporar técnicas agresivas de **mitigación de CLS**, como la reserva de espacio para contenido dinámico mediante alturas mínimas y esqueletos de carga. Además, para gestionar historiales de chat extensos, se implementará la **virtualización de listas** con una biblioteca como React Virtuoso, asegurando que la aplicación se mantenga fluida y con un rendimiento óptimo a escala.

### **Resultado Esperado**

La implementación de esta arquitectura dará como resultado una plataforma de chat con IA robusta, segura y de alto rendimiento. Proporcionará una experiencia de usuario fluida y profesional en todos los dispositivos, resolviendo eficazmente los problemas de renderizado, inestabilidad del layout y responsividad identificados en la implementación inicial.

## **II. La Base: Arquitectura de un Flujo de Datos de Streaming Resiliente en Next.js**

Antes de abordar el renderizado, es imperativo establecer un flujo de datos del lado del cliente que sea robusto, predecible y resistente a los errores comunes asociados con las respuestas de streaming asíncronas.

### **Gestión de Estado para Flujos Asíncronos**

La gestión del estado de una solicitud de streaming es más compleja que una simple petición de datos. Un flujo de streaming transita por múltiples estados discretos: pendiente, en curso, error y completado.

Un simple hook useState es insuficiente para esta tarea. Intentar concatenar fragmentos de datos a una variable de estado de tipo string puede introducir errores sutiles y difíciles de depurar, como los cierres (closures) viciados, donde una función de actualización asíncrona captura un valor obsoleto de la variable de estado, perdiendo los datos acumulados previamente.1

La solución arquitectónica correcta es emplear el hook useReducer.2 Este hook es ideal para gestionar transiciones de estado complejas, ya que centraliza toda la lógica de actualización en una única función reductora. Este patrón, similar al de una máquina de estados, hace que el comportamiento del componente sea más predecible, fácil de depurar y escalable.4

### **Creación de un Hook Personalizado useStreamingResponse**

Para promover la reutilización y la separación de responsabilidades, toda la lógica de streaming debe encapsularse en un hook personalizado de grado de producción.

#### **Detalles de Implementación**

1. **Definición del Estado y las Acciones:** Se define una interfaz para el estado que incluya un status (por ejemplo, 'idle', 'loading', 'streaming', 'success', 'error'), los data acumulados y un campo de error.  
2. **Procesamiento del Stream:** El hook inicia una solicitud fetch y procesa la respuesta utilizando ReadableStream y TextDecoder. Es crucial instanciar el TextDecoder *fuera* del bucle de lectura del stream. Esto garantiza el manejo correcto de caracteres multibyte que podrían dividirse entre dos fragmentos de datos (chunks), evitando la corrupción del texto decodificado.6  
3. **Despacho de Acciones:** Cada fragmento de datos recibido se despacha como una acción al useReducer, que actualiza el estado de forma atómica.  
4. **Gestión del Ciclo de Vida con AbortController:** La lógica de fetch debe estar contenida dentro de un hook useEffect. Este useEffect debe devolver una función de limpieza que llame a controller.abort() en una instancia de AbortController. Esta práctica es absolutamente crítica. Previene fugas de memoria y condiciones de carrera, especialmente en el StrictMode de React, que puede montar y desmontar componentes dos veces en desarrollo para exponer este tipo de fallos arquitectónicos. Sin un AbortController, se podrían iniciar dos flujos de datos paralelos que intentarían actualizar la misma variable de estado, resultando en datos desordenados y corruptos.6

#### **Patrón de Código: useStreamingResponse.ts**

A continuación se presenta una implementación completa del hook, que sirve como un bloque de construcción fundamental para los componentes de la interfaz de usuario.

TypeScript

import { useReducer, useEffect } from 'react';

// 1\. Definir tipos para el estado y las acciones  
type State \= {  
  status: 'idle' | 'loading' | 'streaming' | 'success' | 'error';  
  data: string;  
  error: Error | null;  
};

type Action \=

| { type: 'FETCH\_START' }  
| { type: 'STREAM\_DATA'; payload: string }  
| { type: 'FETCH\_SUCCESS' }  
| { type: 'FETCH\_ERROR'; payload: Error }  
| { type: 'RESET' };

// 2\. Definir el estado inicial y la función reductora  
const initialState: State \= {  
  status: 'idle',  
  data: '',  
  error: null,  
};

function streamingReducer(state: State, action: Action): State {  
  switch (action.type) {  
    case 'FETCH\_START':  
      return {...state, status: 'loading', data: '', error: null };  
    case 'STREAM\_DATA':  
      return {  
       ...state,  
        status: 'streaming',  
        data: state.data \+ action.payload,  
      };  
    case 'FETCH\_SUCCESS':  
      return {...state, status: 'success' };  
    case 'FETCH\_ERROR':  
      return {...state, status: 'error', error: action.payload };  
    case 'RESET':  
      return initialState;  
    default:  
      return state;  
  }  
}

// 3\. El hook personalizado  
export function useStreamingResponse(url: string, body: object) {  
  const \[state, dispatch\] \= useReducer(streamingReducer, initialState);

  useEffect(() \=\> {  
    // 4\. AbortController para una limpieza segura  
    const controller \= new AbortController();  
    const signal \= controller.signal;

    const fetchData \= async () \=\> {  
      dispatch({ type: 'FETCH\_START' });

      try {  
        const response \= await fetch(url, {  
          method: 'POST',  
          headers: { 'Content-Type': 'application/json' },  
          body: JSON.stringify(body),  
          signal,  
        });

        if (\!response.ok) {  
          throw new Error(\`HTTP error\! status: ${response.status}\`);  
        }

        if (\!response.body) {  
          throw new Error('Response body is null');  
        }

        const reader \= response.body.getReader();  
        // 5\. Instanciar el decodificador fuera del bucle  
        const decoder \= new TextDecoder();

        while (true) {  
          const { done, value } \= await reader.read();  
          if (done) {  
            break;  
          }  
          const chunk \= decoder.decode(value, { stream: true });  
          dispatch({ type: 'STREAM\_DATA', payload: chunk });  
        }

        dispatch({ type: 'FETCH\_SUCCESS' });  
      } catch (error) {  
        if (error.name \=== 'AbortError') {  
          console.log('Fetch aborted');  
        } else {  
          dispatch({ type: 'FETCH\_ERROR', payload: error as Error });  
        }  
      }  
    };

    fetchData();

    // 6\. Función de limpieza que aborta la solicitud  
    return () \=\> {  
      controller.abort();  
      dispatch({ type: 'RESET' });  
    };  
  },); // Dependencia en el cuerpo de la solicitud

  return state;  
}

## **III. Revisión del Motor de Renderizado: De markdown-it a una Solución Nativa para Streaming**

El núcleo del problema reside en la elección de la biblioteca de renderizado. Un analizador de Markdown tradicional no está diseñado para el paradigma del streaming, lo que provoca ineficiencia y una experiencia de usuario deficiente.

### **El Problema con los Analizadores Tradicionales**

Bibliotecas como markdown-it 7 y marked 9 operan bajo el supuesto de que reciben un documento de Markdown completo. Cuando se les alimenta con fragmentos parciales, su única opción es concatenar el nuevo fragmento con todo el contenido anterior y volver a analizar la cadena completa desde el principio en cada actualización.10 Este ciclo de re-análisis completo es computacionalmente costoso y es la causa principal del parpadeo visual, el formato incorrecto intermitente y la degradación del rendimiento que se está experimentando.

### **Comparativa de Bibliotecas: react-markdown vs. Streamdown**

* **react-markdown**: Representa una mejora significativa sobre markdown-it para una pila tecnológica basada en React. Se integra directamente con el DOM Virtual de React y aprovecha el potente ecosistema unified (usando remark para el Árbol de Sintaxis Abstracta de Markdown y rehype para el Árbol de Sintaxis Abstracta de HTML).13 Esto permite una personalización profunda mediante la sobreescritura de componentes y un rico sistema de plugins.13 Sin embargo, react-markdown no resuelve de forma nativa el problema del re-análisis en un contexto de streaming. La solución común sigue siendo alimentarlo con la cadena concatenada, lo que perpetúa la ineficiencia fundamental.11  
* **Streamdown**: Es una biblioteca especializada de Vercel, diseñada como un reemplazo directo (drop-in replacement) de react-markdown, creada específicamente para contextos de streaming de IA.14 Su característica distintiva es el **"análisis de bloques no terminados"**. Es capaz de manejar y estilizar con elegancia la sintaxis de Markdown incompleta (por ejemplo, \*\*texto en negrita sin el cierre \*\*), que es precisamente el problema central a resolver.15

### **Recomendación Principal: Adoptar Streamdown**

La elección de Streamdown se justifica porque su abstracción principal se alinea directamente con el dominio del problema. Resuelve el problema de la sintaxis incompleta de forma nativa, está optimizado para el rendimiento con renderizado memorizado y mantiene la compatibilidad con la API de props de react-markdown (components, remarkPlugins, rehypePlugins), facilitando la migración.15

Aunque Streamdown es la mejor herramienta para este trabajo, es importante señalar que, como cualquier software, tiene limitaciones conocidas. Una revisión de sus problemas abiertos en GitHub revela desafíos con el renderizado de ecuaciones matemáticas (KaTeX), un posible aumento en el tamaño del paquete (bundle size), y casos extremos donde el análisis de sintaxis incompleta puede fallar, como listas que usan asteriscos y que son confundidas con texto en cursiva.19 Un equipo de desarrollo debe ser consciente de estos problemas y realizar pruebas específicas para ellos.

| Característica | markdown-it | react-markdown | Streamdown |
| :---- | :---- | :---- | :---- |
| **Paradigma Principal** | Generador de String HTML | Renderizador de VDOM de React | Renderizador de VDOM optimizado para Streaming |
| **Soporte de Streaming** | Nulo | Basado en soluciones provisionales | Nativo y Optimizado |
| **Rendimiento (Streaming)** | Pobre (Re-análisis completo) | Pobre (Re-análisis completo) | Excelente (Optimizado para fragmentos) |
| **Soporte GFM/Tablas** | Plugin | Plugin (remark-gfm) | Integrado (remark-gfm) |
| **Componentes Personalizados** | No | Sí (prop components) | Sí (prop components) |
| **Seguridad** | Sanitización manual requerida | Plugin (rehype-sanitize) | Integrado (rehype-harden) |
| **Recomendación** | **No Recomendado** | Viable, pero ineficiente | **Altamente Recomendado** |

### **El Imperativo de la Seguridad: Sanitización del Output del LLM**

El resultado de un LLM debe ser tratado como contenido no confiable y generado por el usuario. Existe un riesgo real de ataques de inyección de prompts, donde un actor malicioso podría engañar al modelo para que genere scripts ejecutables (por ejemplo, \<img\> con un manejador de eventos onerror).10

La solución es integrar el plugin rehype-sanitize. Este plugin opera sobre el Árbol de Sintaxis Abstracta de HTML (HAST) antes del renderizado, eliminando etiquetas, atributos y protocolos peligrosos.13 Es crucial configurar correctamente el esquema de sanitización para permitir las clases CSS necesarias para el resaltado de sintaxis, que de otro modo serían eliminadas.

### **Mejora con Plugins: Resaltado de Sintaxis y GFM**

Para una experiencia de usuario completa, la configuración de Streamdown debe incluir varios plugins clave:

* **Soporte GFM (remark-gfm):** Esencial para renderizar correctamente las tablas, que es un punto de dolor específico mencionado.13  
* **Resaltado de Sintaxis:** Aunque react-syntax-highlighter es una opción común 24, soluciones más modernas como rehype-shikiji o rehype-pretty-code (que utilizan el motor de resaltado de VS Code, Shiki) ofrecen un resaltado más preciso y pueden funcionar del lado del servidor.26 Para un contexto de streaming del lado del cliente, react-shiki es una excelente opción, ya que está diseñado con características para un resaltado performante de código en streaming.28

#### **Configuración Final del Componente**

La implementación final del componente de renderizado combinaría estas piezas:

TypeScript

import { Streamdown } from 'streamdown';  
import remarkGfm from 'remark-gfm';  
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';  
import deepmerge from 'deepmerge'; // Para fusionar esquemas de forma segura

// Extender el esquema de sanitización para permitir clases de resaltado de sintaxis  
const customSanitizeSchema \= deepmerge(defaultSchema, {  
  attributes: {  
   ...defaultSchema.attributes,  
    code:), \['className', /^language-/\]\],  
    span:), \['className', /^hljs-/\]\], // O las clases que use Shiki  
  },  
});

export function MarkdownRenderer({ content }) {  
  return (  
    \<Streamdown  
      remarkPlugins={\[remarkGfm\]}  
      rehypePlugins={\]}  
      // Aquí se pasarían los componentes personalizados, como la tabla responsiva  
    \>  
      {content}  
    \</Streamdown\>  
  );  
}

## **IV. Alcanzando una Verdadera Responsividad: Container Queries y la UI Autoadaptable**

El problema del "chat que se expande" y rompe el layout es un síntoma de un acoplamiento arquitectónico incorrecto. Las media queries tradicionales no son la herramienta adecuada para resolver este tipo de problema en una aplicación basada en componentes.

### **Las Limitaciones de las Media Queries**

Las media queries aplican estilos basados en el tamaño global del viewport.29 Sin embargo, en una aplicación de chat, un componente de mensaje puede existir en múltiples contextos: una vista principal ancha, una barra lateral estrecha, o una vista previa. El diseño del componente debería depender del espacio que se le asigna, no del tamaño total de la pantalla. El problema actual surge porque el contenido del componente (una tabla ancha) está dictando el tamaño de su contenedor, lo que a su vez rompe el layout global. Esto indica una falta de encapsulación.

### **El Paradigma de las Container Queries**

A partir de 2025, las CSS Container Queries están plenamente soportadas en todos los navegadores principales.30 Permiten que un elemento responda a las dimensiones de su ancestro más cercano que establezca un "contexto de contención".29 Este es el cambio de paradigma necesario para construir componentes verdaderamente modulares, reutilizables y resilientes.

Las Container Queries no son solo una característica de diseño responsivo; son una herramienta arquitectónica que impone la encapsulación y la estabilidad. Son el equivalente en CSS a la inyección de dependencias: el layout de un componente "depende" del tamaño de su contenedor, no de un estado global (el viewport). Al definir la burbuja del mensaje como un contenedor, cualquier regla de estilo dentro de ella que use @container se limita *únicamente* a las dimensiones de esa burbuja. Esto permite que el componente de la tabla sea perfectamente responsivo a su burbuja padre, evitando que su estado interno "se filtre" y afecte al layout global de la página.

### **Guía de Implementación**

1. **Establecer un Contexto de Contención:** En el contenedor principal del mensaje de chat (por ejemplo, .chat-message-bubble), se aplican las propiedades container-type y, opcionalmente, container-name.

.chat-message-bubble {  
container-type: inline-size;  
container-name: message-bubble;  
}  
\`\`\`

29

2. **Consultar el Contenedor:** Ahora, los elementos hijos dentro de la burbuja del mensaje (como un contenedor de tabla) pueden usar la regla @container para aplicar estilos basados en el ancho de la burbuja.  
   CSS  
   /\* Estilos para tablas dentro de una burbuja de mensaje ESTRECHA \*/  
   @container message-bubble (max-width: 600px) {  
    .responsive-table {  
       /\* Aplicar estilos de tarjeta vertical aquí \*/  
     }  
   }

   /\* Estilos para tablas dentro de una burbuja de mensaje ANCHA \*/  
   @container message-bubble (min-width: 601px) {  
    .responsive-table {  
       /\* Mantener el layout de tabla tradicional aquí \*/  
     }  
   }

   29

## **V. Resolviendo el Enigma de las Tablas Responsivas**

Con el motor de renderizado y la estrategia de CSS correctos en su lugar, ahora es posible abordar el punto de dolor más agudo: las tablas generadas por la IA que rompen el layout móvil.

### **La Estrategia Central: Interceptar y Sobrescribir**

La técnica más poderosa es utilizar la prop components en Streamdown (o react-markdown) para reemplazar el elemento \<table\> por defecto con un componente de React personalizado, por ejemplo, \<ResponsiveTable\>.13 Esto nos da un control total sobre el marcado, el estilo y el comportamiento de la tabla.

Este enfoque es la clave para resolver el problema de una manera limpia y mantenible. La prop components actúa como una "vía de escape" de las limitaciones del renderizado HTML estándar hacia el poder completo del modelo de componentes de React. Permite mapear elementos semánticos de Markdown a componentes complejos, interactivos y totalmente responsivos.

TypeScript

\<Streamdown  
  components={{  
    table: (props) \=\> \<ResponsiveTable {...props} /\>,  
    // También se pueden sobreescribir thead, tbody, tr, td, th si es necesario  
  }}  
\>  
  {markdownContent}  
\</Streamdown\>

### **Técnicas de Implementación para la Tabla Responsiva**

| Técnica | Complejidad de Implementación | UX Móvil | UX Escritorio | Recomendación |
| :---- | :---- | :---- | :---- | :---- |
| **Envoltura con Scroll Simple** | Baja | Regular | Buena | Solución rápida para prototipos |
| **Patrón de Tarjetas Colapsables** | Media | Excelente | Excelente | Buen estándar para la mayoría de los casos |
| **Híbrido con Container Queries** | Media-Alta | Excelente | Excelente | **La mejor solución arquitectónica** |

#### **Técnica 1: La Envoltura con Scroll Simple (Buena)**

La solución más directa. El componente \<ResponsiveTable\> simplemente envuelve el elemento \<table\> en un \<div\> con el estilo overflow-x: auto.34

* **Ventajas:** Fácil y rápido de implementar, preserva la estructura de la tabla.  
* **Desventajas:** La experiencia de usuario en móviles es pobre; el scroll horizontal puede ser difícil de descubrir o usar.

#### **Técnica 2: El Patrón de Tarjetas Colapsables (Mejor)**

Un enfoque más amigable para móviles donde la tabla se transforma en una lista de "tarjetas". Cada \<tr\> se convierte en una tarjeta, y las celdas \<td\> se apilan verticalmente. Esto se logra con CSS cambiando las propiedades display en un punto de quiebre.37 Para mejorar la accesibilidad y la claridad, se puede usar JavaScript dentro del componente personalizado para inyectar atributos data-label en cada \<td\>, que corresponden a su encabezado de columna. Luego, los pseudoelementos ::before de CSS pueden mostrar estas etiquetas.38

#### **Técnica 3: El Híbrido con Container Queries (La Mejor)**

Esta es la solución definitiva que combina el poder del componente personalizado con las Container Queries establecidas en la sección anterior. El componente \<ResponsiveTable\> aplica los estilos para cambiar entre la vista de tabla completa y la vista de tarjetas basándose en el ancho de su contenedor (la burbuja del mensaje).

##### **Código de Ejemplo: ResponsiveTable.tsx y su CSS**

TypeScript

// ResponsiveTable.tsx  
import React, { useRef, useEffect, ReactNode } from 'react';  
import './ResponsiveTable.css';

interface TableProps {  
  children?: ReactNode;  
}

export function ResponsiveTable({ children }: TableProps) {  
  const tableRef \= useRef\<HTMLTableElement\>(null);

  // Inyectar etiquetas de datos para el modo de tarjeta  
  useEffect(() \=\> {  
    if (\!tableRef.current) return;  
    const table \= tableRef.current;  
    const headers \= Array.from(table.querySelectorAll('thead th')).map(  
      (th) \=\> th.textContent |

| ''  
    );

    table.querySelectorAll('tbody tr').forEach((row) \=\> {  
      row.querySelectorAll('td').forEach((cell, index) \=\> {  
        cell.setAttribute('data-label', headers\[index\]);  
      });  
    });  
  }, \[children\]);

  return (  
    \<div className="responsive-table-wrapper"\>  
      \<table ref={tableRef}\>{children}\</table\>  
    \</div\>  
  );  
}

CSS

/\* ResponsiveTable.css \*/

/\* El contenedor de la burbuja del mensaje establece el contexto \*/  
.chat-message-bubble {  
  container-type: inline-size;  
  container-name: message-bubble;  
}

.responsive-table-wrapper {  
  width: 100%;  
}

.responsive-table-wrapper table {  
  width: 100%;  
  border-collapse: collapse;  
}

/\* Estilos para contenedores anchos (\> 600px) \*/  
@container message-bubble (min-width: 601px) {  
 .responsive-table-wrapper th,  
 .responsive-table-wrapper td {  
    border: 1px solid \#ddd;  
    padding: 8px;  
    text-align: left;  
  }  
 .responsive-table-wrapper thead {  
    display: table-header-group;  
  }  
 .responsive-table-wrapper tr {  
    display: table-row;  
  }  
 .responsive-table-wrapper td::before {  
    display: none;  
  }  
}

/\* Estilos para contenedores estrechos (\<= 600px) \- Patrón de Tarjetas \*/  
@container message-bubble (max-width: 600px) {  
 .responsive-table-wrapper thead {  
    display: none; /\* Ocultar encabezados, se usarán data-labels \*/  
  }

 .responsive-table-wrapper tr {  
    display: block;  
    margin-bottom: 0.625em;  
    border: 1px solid \#ddd;  
    border-radius: 4px;  
    padding: 0.5em;  
  }

 .responsive-table-wrapper td {  
    display: block;  
    text-align: right; /\* Alinear el contenido a la derecha \*/  
    border-bottom: 1px dotted \#ccc;  
    padding: 6px;  
  }

 .responsive-table-wrapper td:last-child {  
    border-bottom: 0;  
  }

 .responsive-table-wrapper td::before {  
    content: attr(data-label);  
    float: left; /\* Alinear la etiqueta a la izquierda \*/  
    font-weight: bold;  
    text-transform: uppercase;  
  }  
}

## **VI. Puliendo la Experiencia: Eliminando el Desplazamiento de Layout y Virtualizando el Contenido**

Con la base del renderizado y la responsividad establecida, los siguientes pasos se centran en optimizaciones avanzadas de rendimiento y experiencia de usuario que elevan la aplicación a un estándar profesional. Existe una relación causal directa entre estos temas: el streaming de contenido causa CLS, y un largo historial de mensajes transmitidos necesita virtualización.

### **Domando el Cumulative Layout Shift (CLS)**

El "chat en expansión" es un caso clásico de CLS.39 Ocurre porque la burbuja del mensaje se renderiza inicialmente sin contenido (o con muy poco) y luego crece en altura a medida que el texto del stream la llena. Este crecimiento empuja todo el contenido posterior hacia abajo, generando una puntuación de CLS alta y una experiencia de usuario discordante.41

#### **Estrategias de Mitigación**

1. **Altura Mínima (min-height):** Mientras el stream está activo, se aplica una min-height al contenedor de la burbuja del mensaje. Esto reserva una cantidad base de espacio, reduciendo el "salto" inicial cuando comienza la respuesta. La altura puede basarse en una estimación promedio de la longitud de la respuesta.  
2. **Esqueletos de Carga (Skeletons):** Para mensajes que se espera que contengan contenido complejo y de gran tamaño (como bloques de código o imágenes), se debe renderizar un esqueleto de carga dentro de la burbuja. Este esqueleto debe aproximar el tamaño y la forma del contenido final, reservando el espacio de manera más precisa.  
3. **Relación de Aspecto (aspect-ratio) para Imágenes:** Si la IA puede generar imágenes, es fundamental sobrescribir el componente \<img\> (como se hizo con la tabla) y utilizar un componente que aplique la propiedad CSS aspect-ratio o use atributos width y height para que el navegador reserve el espacio vertical correcto antes de que la imagen se cargue.40

### **Manejo de Historiales Infinitos con Virtualización**

A medida que un historial de chat crece a cientos o miles de mensajes, renderizarlos todos en el DOM causa una degradación severa del rendimiento, un tiempo de carga inicial lento y un alto consumo de memoria.43

La solución es la **virtualización de listas**. Se utiliza una biblioteca como TanStack Virtual 44 o React Virtuoso 46 para renderizar únicamente los mensajes que están actualmente visibles en el viewport, más un pequeño búfer de elementos por encima y por debajo.

#### **Elección de la Biblioteca**

Aunque TanStack Virtual es una biblioteca "headless" potente y flexible 44, React Virtuoso a menudo se considera más fácil de implementar para casos de uso complejos de chat. Maneja automáticamente la medición de alturas dinámicas de los mensajes y el anclaje del scroll durante el scroll infinito bidireccional, lo que simplifica enormemente el desarrollo.48 Para una aplicación de chat, se recomienda comenzar con React Virtuoso.

### **Implementación del Scroll Infinito Bidireccional**

Una aplicación de chat moderna debe comenzar en la parte inferior (el mensaje más reciente) y cargar mensajes más antiguos a medida que el usuario se desplaza hacia arriba.46

El principal desafío técnico es añadir nuevos elementos en la parte superior de una lista virtualizada mientras se mantiene la posición de scroll del usuario sin ningún "salto". La biblioteca debe medir la altura de los nuevos elementos añadidos y ajustar el desplazamiento del scroll perfectamente para compensar.

React Virtuoso está diseñado para este caso de uso. Proporciona props como firstItemIndex para gestionar el índice del primer elemento en la lista de datos y un callback startReached que se activa cuando el usuario llega a la parte superior, ideal para activar la carga de la página anterior de datos.51 Este se combina perfectamente con un hook de obtención de datos como useInfiniteQuery de TanStack Query.

## **VII. Síntesis: Un Componente de Mensaje de Chat Completo y Listo para Producción**

Esta sección final integra todas las soluciones recomendadas en un conjunto de componentes de código completo y listo para ser implementado.

### **Desglose de Componentes**

* **ChatHistory.tsx:** El componente padre que implementa React Virtuoso y el hook useInfiniteQuery de TanStack Query para gestionar la lista de mensajes y el scroll bidireccional.  
* **ChatMessage.tsx:** El componente para un mensaje individual. Este componente:  
  * Utilizará el hook personalizado useStreamingResponse si es el mensaje "activo" que está recibiendo un stream.  
  * Establecerá un contexto de contención CSS (container-type).  
  * Renderizará el contenido del mensaje usando el componente \<Streamdown\>.  
  * Pasará el componente personalizado \<ResponsiveTable\> a la prop components de Streamdown.  
  * Incluirá lógica para renderizar un esqueleto de carga y aplicar una min-height para mitigar el CLS durante el streaming.  
* **ResponsiveTable.tsx:** El componente de tabla personalizado con su CSS asociado que utiliza reglas @container para cambiar entre layouts.  
* **useStreamingResponse.ts:** El hook personalizado desarrollado en la Sección II.

### **Código Final**

A continuación se presenta el código comentado en TypeScript y CSS que demuestra cómo todas las piezas arquitectónicas encajan para formar un todo cohesivo, robusto y de alto rendimiento.

#### **ChatHistory.tsx**

TypeScript

import { Virtuoso } from 'react-virtuoso';  
import { useInfiniteQuery } from '@tanstack/react-query';  
import { ChatMessage } from './ChatMessage';  
import { useMemo } from 'react';

// Simulación de una función para obtener mensajes  
async function fetchMessages({ pageParam \= 0 }) {  
  // En una aplicación real, esto sería una llamada a la API  
  const messages \= Array.from({ length: 30 }).map((\_, i) \=\> ({  
    id: \`msg-${pageParam \* 30 \+ i}\`,  
    content: \`Mensaje de historial número ${pageParam \* 30 \+ i}.\`,  
    isStreaming: false,  
  }));  
  return { messages, nextPage: pageParam \+ 1 };  
}

export function ChatHistory() {  
  const {  
    data,  
    fetchNextPage,  
    hasNextPage,  
    isFetchingNextPage,  
  } \= useInfiniteQuery({  
    queryKey: \['messages'\],  
    queryFn: fetchMessages,  
    getNextPageParam: (lastPage) \=\> lastPage.nextPage,  
    initialPageParam: 0,  
  });

  const messages \= useMemo(() \=\> data?.pages.flatMap(page \=\> page.messages).reverse() ||, \[data\]);  
  const activeMessage \= { id: 'active-1', content: '', isStreaming: true }; // Mensaje actual en streaming

  const allMessages \= \[...messages, activeMessage\];

  return (  
    \<Virtuoso  
      style={{ height: '100vh' }}  
      data={allMessages}  
      initialTopMostItemIndex={allMessages.length \- 1}  
      followOutput="auto"  
      startReached={() \=\> {  
        if (hasNextPage &&\!isFetchingNextPage) {  
          fetchNextPage();  
        }  
      }}  
      itemContent={(index, message) \=\> (  
        \<ChatMessage  
          key={message.id}  
          content={message.content}  
          isStreaming={message.isStreaming}  
        /\>  
      )}  
    /\>  
  );  
}

#### **ChatMessage.tsx**

TypeScript

import { useState, useEffect } from 'react';  
import { Streamdown } from 'streamdown';  
import remarkGfm from 'remark-gfm';  
import rehypeSanitize from 'rehype-sanitize';  
import { ResponsiveTable } from './ResponsiveTable';  
import './ChatMessage.css';

// Hook useStreamingResponse y configuración de sanitización de la Sección II y III

interface ChatMessageProps {  
  content: string;  
  isStreaming: boolean;  
}

export function ChatMessage({ content, isStreaming }: ChatMessageProps) {  
  // En una aplicación real, el contenido del stream vendría del hook useStreamingResponse  
  const \= useState('');

  // Simulación de un stream  
  useEffect(() \=\> {  
    if (isStreaming) {  
      const exampleContent \= \`  
Hola\! Aquí tienes una tabla de ejemplo:

| Cabecera 1 | Cabecera 2 | Cabecera 3 |  
|------------|------------|------------|  
| Fila 1, C1 | Fila 1, C2 | Fila 1, C3 |  
| Fila 2, C1 | Fila 2, C2 | Fila 2, C3 |

Y también un bloque de código:

\\\`\\\`\\\`javascript  
function helloWorld() {  
  console.log("¡Hola, mundo\!");  
}  
\\\`\\\`\\\`  
      \`;  
      let i \= 0;  
      const interval \= setInterval(() \=\> {  
        setStreamedContent(exampleContent.substring(0, i));  
        i++;  
        if (i \> exampleContent.length) {  
          clearInterval(interval);  
        }  
      }, 20);  
      return () \=\> clearInterval(interval);  
    }  
  },);

  const finalContent \= isStreaming? streamedContent : content;

  return (  
    \<div className={\`chat-message-bubble ${isStreaming? 'streaming' : ''}\`}\>  
      {isStreaming && finalContent.length \=== 0 && \<div className="skeleton-loader" /\>}  
      \<Streamdown  
        remarkPlugins={\[remarkGfm\]}  
        rehypePlugins={}  
        components={{  
          table: ResponsiveTable,  
        }}  
      \>  
        {finalContent}  
      \</Streamdown\>  
    \</div\>  
  );  
}

#### **ChatMessage.css**

CSS

.chat-message-bubble {  
  container-type: inline-size;  
  container-name: message-bubble;  
  padding: 12px 16px;  
  border-radius: 18px;  
  background-color: \#f0f0f0;  
  margin: 8px;  
  max-width: 80%;  
  word-wrap: break-word;  
}

/\* Mitigación de CLS \*/  
.chat-message-bubble.streaming {  
  min-height: 50px;  
}

.skeleton-loader {  
  width: 80%;  
  height: 20px;  
  background-color: \#e0e0e0;  
  border-radius: 4px;  
  animation: pulse 1.5s infinite ease-in-out;  
}

@keyframes pulse {  
  0% {  
    opacity: 1;  
  }  
  50% {  
    opacity: 0.5;  
  }  
  100% {  
    opacity: 1;  
  }  
}

#### **Fuentes citadas**

1. Render Streamed OpenAI Responses with React \- Rebecca M. Deprey, acceso: octubre 24, 2025, [https://rebeccamdeprey.com/blog/render-openai-stream-responses-with-react](https://rebeccamdeprey.com/blog/render-openai-stream-responses-with-react)  
2. A guide to the React useReducer Hook \- LogRocket Blog, acceso: octubre 24, 2025, [https://blog.logrocket.com/react-usereducer-hook-ultimate-guide/](https://blog.logrocket.com/react-usereducer-hook-ultimate-guide/)  
3. This is the simple implementation of useFetch custom hook with useReducer to fetch data in react App. \- GitHub, acceso: octubre 24, 2025, [https://github.com/haticecs/usefetch-with-usereducer](https://github.com/haticecs/usefetch-with-usereducer)  
4. Fetch Data With useReducer Hook in React | React JS Tutorial \- YouTube, acceso: octubre 24, 2025, [https://www.youtube.com/watch?v=TDZAcdPAbyg](https://www.youtube.com/watch?v=TDZAcdPAbyg)  
5. React Custom Hook \- useFetch \- DEV Community, acceso: octubre 24, 2025, [https://dev.to/techcheck/custom-react-hook-usefetch-eid](https://dev.to/techcheck/custom-react-hook-usefetch-eid)  
6. React setState and streaming response \- Stack Overflow, acceso: octubre 24, 2025, [https://stackoverflow.com/questions/77555649/react-setstate-and-streaming-response](https://stackoverflow.com/questions/77555649/react-setstate-and-streaming-response)  
7. markdown-it vs react-markdown | Markdown Parsing Libraries ..., acceso: octubre 24, 2025, [https://npm-compare.com/markdown-it,react-markdown](https://npm-compare.com/markdown-it,react-markdown)  
8. marked vs markdown-it vs react-markdown vs markdown | Compare Similar npm Packages, acceso: octubre 24, 2025, [https://npm-compare.com/markdown,markdown-it,marked,react-markdown](https://npm-compare.com/markdown,markdown-it,marked,react-markdown)  
9. markedjs/marked: A markdown parser and compiler. Built for speed. \- GitHub, acceso: octubre 24, 2025, [https://github.com/markedjs/marked](https://github.com/markedjs/marked)  
10. Best practices to render streamed LLM responses | AI on Chrome, acceso: octubre 24, 2025, [https://developer.chrome.com/docs/ai/render-llm-responses](https://developer.chrome.com/docs/ai/render-llm-responses)  
11. Streaming Markdown or Other Formatted Text \- API \- OpenAI Developer Community, acceso: octubre 24, 2025, [https://community.openai.com/t/streaming-markdown-or-other-formatted-text/510268](https://community.openai.com/t/streaming-markdown-or-other-formatted-text/510268)  
12. How to format and display streaming Markdown data on the fly in TypeScript using Showdown? \- Stack Overflow, acceso: octubre 24, 2025, [https://stackoverflow.com/questions/79250114/how-to-format-and-display-streaming-markdown-data-on-the-fly-in-typescript-using](https://stackoverflow.com/questions/79250114/how-to-format-and-display-streaming-markdown-data-on-the-fly-in-typescript-using)  
13. remarkjs/react-markdown: Markdown component for React \- GitHub, acceso: octubre 24, 2025, [https://github.com/remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)  
14. React Status Issue 441: August 27, 2025, acceso: octubre 24, 2025, [https://react.statuscode.com/issues/441](https://react.statuscode.com/issues/441)  
15. vercel/streamdown: A drop-in replacement for react-markdown, designed for AI-powered streaming. \- GitHub, acceso: octubre 24, 2025, [https://github.com/vercel/streamdown](https://github.com/vercel/streamdown)  
16. Streamdown: The Ultimate Tool for Streaming Markdown in AI Applications | Efficient Coder, acceso: octubre 24, 2025, [https://www.xugj520.cn/en/archives/streamdown-ai-streaming-markdown.html](https://www.xugj520.cn/en/archives/streamdown-ai-streaming-markdown.html)  
17. Render Streaming AI Markdown with Streamdown \- ReactScript, acceso: octubre 24, 2025, [https://reactscript.com/render-streaming-ai-markdown/](https://reactscript.com/render-streaming-ai-markdown/)  
18. phaserjs/streamdown-lite: A drop-in replacement for react-markdown, designed for AI-powered streaming. \- GitHub, acceso: octubre 24, 2025, [https://github.com/phaserjs/streamdown-lite](https://github.com/phaserjs/streamdown-lite)  
19. Issues · vercel/streamdown \- GitHub, acceso: octubre 24, 2025, [https://github.com/vercel/streamdown/issues](https://github.com/vercel/streamdown/issues)  
20. Streamdown is not working properly only in rendering the mathematical equations. Rest is working fine and perfect. · Issue \#159 \- GitHub, acceso: octubre 24, 2025, [https://github.com/vercel/streamdown/issues/159](https://github.com/vercel/streamdown/issues/159)  
21. chat ui hangs while generating large coding blocks · Issue \#141 · vercel/streamdown, acceso: octubre 24, 2025, [https://github.com/vercel/streamdown/issues/141](https://github.com/vercel/streamdown/issues/141)  
22. Bug with terminating lists on certain models · Issue \#33 · vercel/streamdown \- GitHub, acceso: octubre 24, 2025, [https://github.com/vercel/streamdown/issues/33](https://github.com/vercel/streamdown/issues/33)  
23. rehypejs/rehype-sanitize: plugin to sanitize HTML \- GitHub, acceso: octubre 24, 2025, [https://github.com/rehypejs/rehype-sanitize](https://github.com/rehypejs/rehype-sanitize)  
24. React Markdown Examples \- Medium, acceso: octubre 24, 2025, [https://medium.com/@dimterion/react-markdown-examples-372fa1b21c0c](https://medium.com/@dimterion/react-markdown-examples-372fa1b21c0c)  
25. Enhancing Your React-Markdown Experience with Syntax Highlighting in a React Application | Hannad Rehman, acceso: octubre 24, 2025, [https://hannadrehman.com/blog/enhancing-your-react-markdown-experience-with-syntax-highlighting](https://hannadrehman.com/blog/enhancing-your-react-markdown-experience-with-syntax-highlighting)  
26. Syntax highlight with Shiki syntax highlighter, acceso: octubre 24, 2025, [https://www.vaishnavs.xyz/blog/syntax-highlight-with-shiki](https://www.vaishnavs.xyz/blog/syntax-highlight-with-shiki)  
27. Syntax highlighting with Markdoc and Shiki in Remix | Andre Landgraf, acceso: octubre 24, 2025, [https://andrelandgraf.dev/blog/2024-11-30\_syntax-highlighting-with-markdoc](https://andrelandgraf.dev/blog/2024-11-30_syntax-highlighting-with-markdoc)  
28. react-shiki, acceso: octubre 24, 2025, [https://react-shiki.vercel.app/](https://react-shiki.vercel.app/)  
29. CSS container queries \- CSS | MDN, acceso: octubre 24, 2025, [https://developer.mozilla.org/en-US/docs/Web/CSS/CSS\_containment/Container\_queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)  
30. A Friendly Introduction to Container Queries • Josh W. Comeau, acceso: octubre 24, 2025, [https://www.joshwcomeau.com/css/container-queries-introduction/](https://www.joshwcomeau.com/css/container-queries-introduction/)  
31. CSS Container Queries, acceso: octubre 24, 2025, [https://css-tricks.com/css-container-queries/](https://css-tricks.com/css-container-queries/)  
32. Building a Responsive Layout in 2025: CSS Grid vs Flexbox vs Container Queries \- DEV Community, acceso: octubre 24, 2025, [https://dev.to/smriti\_webdev/building-a-responsive-layout-in-2025-css-grid-vs-flexbox-vs-container-queries-234m](https://dev.to/smriti_webdev/building-a-responsive-layout-in-2025-css-grid-vs-flexbox-vs-container-queries-234m)  
33. react-markdown, acceso: octubre 24, 2025, [https://remarkjs.github.io/react-markdown/](https://remarkjs.github.io/react-markdown/)  
34. How to Write Responsive HTML Tables (for Markdown Sites) \- John Franey, acceso: octubre 24, 2025, [https://johnfraney.ca/blog/how-to-write-responsive-html-tables/](https://johnfraney.ca/blog/how-to-write-responsive-html-tables/)  
35. Responsive tables in markdown \- support \- HUGO, acceso: octubre 24, 2025, [https://discourse.gohugo.io/t/responsive-tables-in-markdown/10639](https://discourse.gohugo.io/t/responsive-tables-in-markdown/10639)  
36. React Table \- Flowbite, acceso: octubre 24, 2025, [https://flowbite-react.com/docs/components/table](https://flowbite-react.com/docs/components/table)  
37. Accessible, Simple, Responsive Tables | CSS-Tricks, acceso: octubre 24, 2025, [https://css-tricks.com/accessible-simple-responsive-tables/](https://css-tricks.com/accessible-simple-responsive-tables/)  
38. Easy Responsive Tables with Markdown in React. \- DEV Community, acceso: octubre 24, 2025, [https://dev.to/jesster2k10/easy-responsive-tables-with-markdown-in-react-5edp](https://dev.to/jesster2k10/easy-responsive-tables-with-markdown-in-react-5edp)  
39. Cumulative Layout Shift (CLS) | Articles \- web.dev, acceso: octubre 24, 2025, [https://web.dev/articles/cls](https://web.dev/articles/cls)  
40. How To Fix Cumulative Layout Shift (CLS) Issues \- Smashing Magazine, acceso: octubre 24, 2025, [https://www.smashingmagazine.com/2021/06/how-to-fix-cumulative-layout-shift-issues/](https://www.smashingmagazine.com/2021/06/how-to-fix-cumulative-layout-shift-issues/)  
41. Optimize Cumulative Layout Shift | Articles | web.dev, acceso: octubre 24, 2025, [https://web.dev/articles/optimize-cls](https://web.dev/articles/optimize-cls)  
42. Use Next.js Image component in posts with Markdown \- Sebastien Castiel, acceso: octubre 24, 2025, [https://scastiel.dev/nextjs-image-in-markdown](https://scastiel.dev/nextjs-image-in-markdown)  
43. From Lag to Lightning: How TanStack Virtual Optimizes 1000s of Items Smoothly \- Medium, acceso: octubre 24, 2025, [https://medium.com/@sanjivchaudhary416/from-lag-to-lightning-how-tanstack-virtual-optimizes-1000s-of-items-smoothly-24f0998dc444](https://medium.com/@sanjivchaudhary416/from-lag-to-lightning-how-tanstack-virtual-optimizes-1000s-of-items-smoothly-24f0998dc444)  
44. TanStack Virtual, acceso: octubre 24, 2025, [https://tanstack.com/virtual](https://tanstack.com/virtual)  
45. TanStack/virtual: Headless UI for Virtualizing Large Element Lists in JS/TS, React, Solid, Vue and Svelte \- GitHub, acceso: octubre 24, 2025, [https://github.com/TanStack/virtual](https://github.com/TanStack/virtual)  
46. Optimizing Large Datasets with Virtualized Lists | by Eva Matova | Medium, acceso: octubre 24, 2025, [https://medium.com/@eva.matova6/optimizing-large-datasets-with-virtualized-lists-70920e10da54](https://medium.com/@eva.matova6/optimizing-large-datasets-with-virtualized-lists-70920e10da54)  
47. React Virtual | TanStack Virtual React Docs, acceso: octubre 24, 2025, [https://tanstack.com/virtual/latest/docs/framework/react/react-virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)  
48. Support for "chat" like use cases · TanStack virtual · Discussion \#477 \- GitHub, acceso: octubre 24, 2025, [https://github.com/TanStack/virtual/discussions/477](https://github.com/TanStack/virtual/discussions/477)  
49. Performance vs react-virtuoso \- TanStack \- Answer Overflow, acceso: octubre 24, 2025, [https://www.answeroverflow.com/m/1180528635233435648](https://www.answeroverflow.com/m/1180528635233435648)  
50. Current Developer Choices & Experiences: Bidirectional Virtualization for Dynamic Chat Messages (e.g., Virtuoso, react-window, TanStack Virtual) : r/reactjs \- Reddit, acceso: octubre 24, 2025, [https://www.reddit.com/r/reactjs/comments/1ns3v2a/current\_developer\_choices\_experiences/](https://www.reddit.com/r/reactjs/comments/1ns3v2a/current_developer_choices_experiences/)  
51. Endless Scrolling \- React Virtuoso, acceso: octubre 24, 2025, [https://virtuoso.dev/endless-scrolling/](https://virtuoso.dev/endless-scrolling/)  
52. bidirectional infinite scroll · petyosi react-virtuoso · Discussion \#634 \- GitHub, acceso: octubre 24, 2025, [https://github.com/petyosi/react-virtuoso/discussions/634](https://github.com/petyosi/react-virtuoso/discussions/634)