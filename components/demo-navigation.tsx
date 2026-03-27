"use client"
import { Card } from "@/components/ui/card"
import { Brain, Stethoscope, BookOpen, Play, Smartphone, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"

interface DemoNavigationProps {
  currentDemo: string
  onDemoChange: (demo: string) => void
}

const demoSections = [
  {
    id: "overview",
    title: "System Overview",
    icon: Play,
    description: "Introduction to the three-agent architecture",
  },
  {
    id: "socratico",
    title: "Supervisor Clínico",
    icon: Brain,
    description: "Therapeutic dialogue and deep reflection",
    color: "blue",
  },
  {
    id: "clinico",
    title: "Especialista en Documentación",
    icon: Stethoscope,
    description: "Clinical synthesis and documentation",
    color: "green",
  },
  {
    id: "academico",
    title: "HopeAI Académico",
    icon: BookOpen,
    description: "Academic research and evidence",
    color: "purple",
  },
  {
    id: "workflows",
    title: "Core Workflows",
    icon: Monitor,
    description: "Document management and session continuity",
  },
  {
    id: "mobile",
    title: "Mobile Experience",
    icon: Smartphone,
    description: "Responsive design and voice integration",
  },
]

export function DemoNavigation({ currentDemo, onDemoChange }: DemoNavigationProps) {
  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {demoSections.map((section) => {
          const IconComponent = section.icon
          const isActive = currentDemo === section.id

          return (
            <Card
              key={section.id}
              className={cn(
                "p-4 cursor-pointer transition-all duration-200 hover:shadow-lg",
                isActive && "ring-2 ring-blue-500 bg-blue-50",
                section.color === "blue" && isActive && "ring-blue-500 bg-blue-50",
                section.color === "green" && isActive && "ring-green-500 bg-green-50",
                section.color === "purple" && isActive && "ring-purple-500 bg-purple-50",
              )}
              onClick={() => onDemoChange(section.id)}
            >
              <div className="text-center space-y-2">
                <div
                  className={cn(
                    "w-12 h-12 mx-auto rounded-full flex items-center justify-center",
                    section.color === "blue" && "bg-blue-100 text-blue-600",
                    section.color === "green" && "bg-green-100 text-green-600",
                    section.color === "purple" && "bg-purple-100 text-purple-600",
                    !section.color && "bg-gray-100 text-gray-600",
                  )}
                >
                  <IconComponent className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{section.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{section.description}</p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
