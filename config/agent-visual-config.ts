// Aurora Visual Identity v2.0 - Phosphor Icons Integration
import { Eye, Notebook, Microscope, Lightning, Spinner, CircleNotch } from "@phosphor-icons/react"
import type { AgentType } from "@/types/clinical-types"

/**
 * Aurora Visual Identity v2.0
 *
 * Paleta de Facetas:
 * - Perspectiva (Análisis): Clarity Blue #0D6EFD - Icono: Eye (observación profunda)
 * - Memoria (Documentación): Serene Teal #20C997 - Icono: Notebook (registro estructurado)
 * - Evidencia (Investigación): Academic Plum #6F42C1 - Icono: Microscope (investigación científica)
 *
 * Paleta Neutra:
 * - Cloud White #F8F9FA (fondo principal)
 * - Deep Charcoal #343A40 (texto principal)
 * - Mineral Gray #6C757D (texto secundario)
 * - Ash #E9ECEF (bordes y divisores)
 *
 * Iconografía: Phosphor Icons - Diseño moderno, minimalista y elegante
 */

const agentVisuals = {
    // Aurora Facet: Perspectiva (Análisis Psicoterapéutico) - Clarity Blue
    // Mantiene clave 'socratico' para compatibilidad con backend
    socratico: {
        name: "Perspectiva",
        description: "Análisis reflexivo y exploración profunda del caso clínico",
        icon: Eye,
        textColor: 'text-clarity-blue-700 dark:text-clarity-blue-300',
        bgColor: 'bg-clarity-blue-50 dark:bg-clarity-blue-900/40',
        borderColor: 'border-clarity-blue-200 dark:border-clarity-blue-600',
        focusWithinBorderColor: 'focus-within:border-clarity-blue-400 dark:focus-within:border-clarity-blue-500',
        typingDotColor: 'bg-clarity-blue-500 dark:bg-clarity-blue-400',
        button: {
            bg: 'bg-clarity-blue-100 dark:bg-clarity-blue-700/50',
            hoverBg: 'hover:bg-clarity-blue-200 dark:hover:bg-clarity-blue-600/60',
            text: 'text-clarity-blue-900 dark:text-clarity-blue-100',
        },
        ghostButton: {
            text: 'text-clarity-blue-700 dark:text-clarity-blue-300',
            hoverBg: 'hover:bg-clarity-blue-100 dark:hover:bg-clarity-blue-800/50',
        }
    },
    // Aurora Facet: Memoria (Documentación Clínica) - Serene Teal
    // Mantiene clave 'clinico' para compatibilidad con backend
    clinico: {
        name: "Memoria",
        description: "Documentación estructurada y síntesis clínica profesional",
        icon: Notebook,
        textColor: 'text-serene-teal-700 dark:text-serene-teal-300',
        bgColor: 'bg-serene-teal-50 dark:bg-serene-teal-900/40',
        borderColor: 'border-serene-teal-200 dark:border-serene-teal-600',
        focusWithinBorderColor: 'focus-within:border-serene-teal-400 dark:focus-within:border-serene-teal-500',
        typingDotColor: 'bg-serene-teal-500 dark:bg-serene-teal-400',
        button: {
            bg: 'bg-serene-teal-100 dark:bg-serene-teal-700/50',
            hoverBg: 'hover:bg-serene-teal-200 dark:hover:bg-serene-teal-600/60',
            text: 'text-serene-teal-900 dark:text-serene-teal-100',
        },
        ghostButton: {
            text: 'text-serene-teal-700 dark:text-serene-teal-300',
            hoverBg: 'hover:bg-serene-teal-100 dark:hover:bg-serene-teal-800/50',
        }
    },
    // Aurora Facet: Evidencia (Investigación Académica) - Academic Plum
    // Mantiene clave 'academico' para compatibilidad con backend
    academico: {
        name: "Evidencia",
        description: "Investigación científica y validación empírica rigurosa",
        icon: Microscope,
        textColor: 'text-academic-plum-700 dark:text-academic-plum-300',
        bgColor: 'bg-academic-plum-50 dark:bg-academic-plum-900/40',
        borderColor: 'border-academic-plum-200 dark:border-academic-plum-600',
        focusWithinBorderColor: 'focus-within:border-academic-plum-400 dark:focus-within:border-academic-plum-500',
        typingDotColor: 'bg-academic-plum-500 dark:bg-academic-plum-400',
        button: {
            bg: 'bg-academic-plum-100 dark:bg-academic-plum-700/50',
            hoverBg: 'hover:bg-academic-plum-200 dark:hover:bg-academic-plum-600/60',
            text: 'text-academic-plum-900 dark:text-academic-plum-100',
        },
        ghostButton: {
            text: 'text-academic-plum-700 dark:text-academic-plum-300',
            hoverBg: 'hover:bg-academic-plum-100 dark:hover:bg-academic-plum-800/50',
        }
    },
    // Orquestador - Neutral palette (Mineral Gray / Ash)
    orquestador: {
        name: "Sistema de Coordinación",
        description: "Coordinación inteligente entre especialistas",
        icon: Lightning,
        textColor: 'text-deep-charcoal dark:text-mineral-gray',
        bgColor: 'bg-ash dark:bg-gray-900/40',
        borderColor: 'border-mineral-gray dark:border-gray-700',
        focusWithinBorderColor: 'focus-within:border-mineral-gray dark:focus-within:border-gray-600',
        typingDotColor: 'bg-mineral-gray dark:bg-gray-400',
        button: {
            bg: 'bg-mineral-gray/20 dark:bg-gray-800/50',
            hoverBg: 'hover:bg-mineral-gray/30 dark:hover:bg-gray-700/60',
            text: 'text-deep-charcoal dark:text-gray-100',
        },
        ghostButton: {
            text: 'text-mineral-gray dark:text-gray-300',
            hoverBg: 'hover:bg-ash dark:hover:bg-gray-800/40',
        }
    },
    // Desconocido - Neutral palette
    desconocido: {
        name: "Sistema de Asistencia Clínica",
        description: "Procesando consulta clínica...",
        icon: CircleNotch,
        textColor: 'text-deep-charcoal dark:text-mineral-gray',
        bgColor: 'bg-ash dark:bg-gray-900/40',
        borderColor: 'border-mineral-gray dark:border-gray-700',
        focusWithinBorderColor: 'focus-within:border-mineral-gray dark:focus-within:border-gray-600',
        typingDotColor: 'bg-mineral-gray dark:bg-gray-400',
        button: {
            bg: 'bg-deep-charcoal dark:bg-gray-800',
            hoverBg: 'hover:bg-deep-charcoal/90 dark:hover:bg-gray-700',
            text: 'text-cloud-white dark:text-gray-100',
        },
        ghostButton: {
            text: 'text-mineral-gray dark:text-gray-300',
            hoverBg: 'hover:bg-ash dark:hover:bg-gray-800/40',
        }
    }
};

export const getAgentVisualConfig = (agent: AgentType) => {
    return agentVisuals[agent] || agentVisuals.desconocido;
};

export const getAgentVisualConfigSafe = (agent?: AgentType) => {
    if (!agent || !(agent in agentVisuals)) {
        return agentVisuals.desconocido;
    }
    return agentVisuals[agent];
};