import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

const Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme()

  return (
<Sonner
  position="top-right"
  theme="light"
  toastOptions={{
    classNames: {
      toast:
        "bg-white border border-gray-200 shadow-lg text-gray-900",
      success:
        "bg-white border-green-200",
      icon:
        "text-green-600",
    },
  }}
  icons={{
    success: (
      <CircleCheckIcon className="size-5 text-green-600" />
    ),
    info: <InfoIcon className="size-5 text-blue-600" />,
    warning: <TriangleAlertIcon className="size-5 text-amber-500" />,
    error: <OctagonXIcon className="size-5 text-red-600" />,
    loading: <Loader2Icon className="size-5 animate-spin" />,
  }}
/>
  )
}

export { Toaster }