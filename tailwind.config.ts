import type { Config } from "tailwindcss";

// all in fixtures is set to tailwind v3 as interims solutions

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./config/**/*.{js,ts,jsx,tsx,mdx}",
    "*.{js,ts,jsx,tsx,mdx}"
  ],
  safelist: [
    // Aurora Palette - Serene Teal (Memoria/Documentación)
    'text-serene-teal-50', 'text-serene-teal-100', 'text-serene-teal-200', 'text-serene-teal-300', 'text-serene-teal-400', 'text-serene-teal-500', 'text-serene-teal-600', 'text-serene-teal-700', 'text-serene-teal-800', 'text-serene-teal-900',
    'bg-serene-teal-50', 'bg-serene-teal-100', 'bg-serene-teal-200', 'bg-serene-teal-300', 'bg-serene-teal-400', 'bg-serene-teal-500', 'bg-serene-teal-600', 'bg-serene-teal-700', 'bg-serene-teal-800', 'bg-serene-teal-900',
    'border-serene-teal-50', 'border-serene-teal-100', 'border-serene-teal-200', 'border-serene-teal-300', 'border-serene-teal-400', 'border-serene-teal-500', 'border-serene-teal-600', 'border-serene-teal-700', 'border-serene-teal-800', 'border-serene-teal-900',
    'focus-within:border-serene-teal-300', 'focus-within:border-serene-teal-400', 'focus-within:border-serene-teal-500',
    'hover:bg-serene-teal-100', 'hover:bg-serene-teal-200', 'hover:bg-serene-teal-300', 'hover:bg-serene-teal-600', 'hover:bg-serene-teal-700',

    // Aurora Palette - Clarity Blue (Perspectiva/Análisis)
    'text-clarity-blue-50', 'text-clarity-blue-100', 'text-clarity-blue-200', 'text-clarity-blue-300', 'text-clarity-blue-400', 'text-clarity-blue-500', 'text-clarity-blue-600', 'text-clarity-blue-700', 'text-clarity-blue-800', 'text-clarity-blue-900',
    'bg-clarity-blue-50', 'bg-clarity-blue-100', 'bg-clarity-blue-200', 'bg-clarity-blue-300', 'bg-clarity-blue-400', 'bg-clarity-blue-500', 'bg-clarity-blue-600', 'bg-clarity-blue-700', 'bg-clarity-blue-800', 'bg-clarity-blue-900',
    'border-clarity-blue-50', 'border-clarity-blue-100', 'border-clarity-blue-200', 'border-clarity-blue-300', 'border-clarity-blue-400', 'border-clarity-blue-500', 'border-clarity-blue-600', 'border-clarity-blue-700', 'border-clarity-blue-800', 'border-clarity-blue-900',
    'focus-within:border-clarity-blue-300', 'focus-within:border-clarity-blue-400', 'focus-within:border-clarity-blue-500',
    'hover:bg-clarity-blue-100', 'hover:bg-clarity-blue-200', 'hover:bg-clarity-blue-300', 'hover:bg-clarity-blue-600', 'hover:bg-clarity-blue-700',

    // Aurora Palette - Academic Plum (Evidencia/Investigación)
    'text-academic-plum-50', 'text-academic-plum-100', 'text-academic-plum-200', 'text-academic-plum-300', 'text-academic-plum-400', 'text-academic-plum-500', 'text-academic-plum-600', 'text-academic-plum-700', 'text-academic-plum-800', 'text-academic-plum-900',
    'bg-academic-plum-50', 'bg-academic-plum-100', 'bg-academic-plum-200', 'bg-academic-plum-300', 'bg-academic-plum-400', 'bg-academic-plum-500', 'bg-academic-plum-600', 'bg-academic-plum-700', 'bg-academic-plum-800', 'bg-academic-plum-900',
    'border-academic-plum-50', 'border-academic-plum-100', 'border-academic-plum-200', 'border-academic-plum-300', 'border-academic-plum-400', 'border-academic-plum-500', 'border-academic-plum-600', 'border-academic-plum-700', 'border-academic-plum-800', 'border-academic-plum-900',
    'focus-within:border-academic-plum-300', 'focus-within:border-academic-plum-400', 'focus-within:border-academic-plum-500',
    'hover:bg-academic-plum-100', 'hover:bg-academic-plum-200', 'hover:bg-academic-plum-300', 'hover:bg-academic-plum-600', 'hover:bg-academic-plum-700',

    // Aurora Palette - Neutrals
    'text-cloud-white', 'bg-cloud-white', 'border-cloud-white',
    'text-deep-charcoal', 'bg-deep-charcoal', 'border-deep-charcoal',
    'text-mineral-gray', 'bg-mineral-gray', 'border-mineral-gray',
    'text-ash', 'bg-ash', 'border-ash',

    // Text Truncation & Overflow - CRÍTICO para producción
    // Estas clases se usan en cards del sidebar y pueden ser purgadas en build
    'line-clamp-1', 'line-clamp-2', 'line-clamp-3', 'line-clamp-4', 'line-clamp-5', 'line-clamp-6',
    'truncate', 'text-ellipsis', 'overflow-hidden', 'overflow-visible', 'overflow-auto',
    'break-words', 'break-all', 'break-normal',
    'whitespace-normal', 'whitespace-nowrap', 'whitespace-pre-wrap',
    'min-w-0', 'max-w-full', 'w-full',
  ],
  prefix: "",
  theme: {
  	extend: {
  		fontFamily: {
  			serif: ['var(--font-serif)', 'Georgia', 'serif'],
  			sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			// Aurora Palette - Primary Neutrals
  			'cloud-white': '#F8F9FA',
  			'deep-charcoal': '#343A40',
  			'mineral-gray': '#6C757D',
  			'ash': '#E9ECEF',
  			// Aurora Palette - Serene Teal (Memoria/Documentación) #20C997
  			'serene-teal': {
  				50: '#E6FCF5',
  				100: '#C3FAE8',
  				200: '#8CF5D2',
  				300: '#51EABB',
  				400: '#2DD4A7',
  				500: '#20C997',
  				600: '#1AA179',
  				700: '#147D5F',
  				800: '#0F5E47',
  				900: '#0A3F2F',
  			},
  			// Aurora Palette - Clarity Blue (Perspectiva/Análisis) #0D6EFD
  			'clarity-blue': {
  				50: '#E7F1FF',
  				100: '#C3DEFF',
  				200: '#8BBFFF',
  				300: '#529FFF',
  				400: '#2684FF',
  				500: '#0D6EFD',
  				600: '#0A58CA',
  				700: '#08469F',
  				800: '#063574',
  				900: '#042349',
  			},
			// Aurora Palette - Academic Plum (Evidencia/Investigación) #6F42C1
			'academic-plum': {
				50: '#F4EFFC',
				100: '#E5D9F7',
				200: '#CBAFEF',
				300: '#B088E8',
				400: '#9565D4',
				500: '#6F42C1',
				600: '#5A359D',
				700: '#47297A',
				800: '#341E57',
				900: '#221334',
			},
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
