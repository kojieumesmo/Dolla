import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert hex color to HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

// Calculate contrast ratio between two colors
function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    
    const [rs, gs, bs] = [r, g, b].map(c => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    )
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }
  
  const l1 = getLuminance(color1)
  const l2 = getLuminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  
  return (lighter + 0.05) / (darker + 0.05)
}

// Set theme colors with automatic contrast adjustment
export function setThemeColors(primaryColor: string) {
  const hsl = hexToHsl(primaryColor)
  const root = document.documentElement
  
  // Set primary color
  root.style.setProperty('--theme-primary', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
  
  // Calculate appropriate foreground color for contrast
  const whiteContrast = getContrastRatio(primaryColor, '#ffffff')
  const blackContrast = getContrastRatio(primaryColor, '#000000')
  
  // Use white text if it has better contrast, otherwise use black
  const foregroundColor = whiteContrast > blackContrast ? '0 0% 100%' : '0 0% 0%'
  
  root.style.setProperty('--theme-primary-foreground', foregroundColor)
  
  // Set secondary and accent colors (slightly different shades)
  const secondaryHsl = { ...hsl, l: Math.max(20, hsl.l - 10) }
  const accentHsl = { ...hsl, l: Math.min(80, hsl.l + 10) }
  
  root.style.setProperty('--theme-secondary', `${secondaryHsl.h} ${secondaryHsl.s}% ${secondaryHsl.l}%`)
  root.style.setProperty('--theme-secondary-foreground', foregroundColor)
  root.style.setProperty('--theme-accent', `${accentHsl.h} ${accentHsl.s}% ${accentHsl.l}%`)
  root.style.setProperty('--theme-accent-foreground', foregroundColor)
}

// Get theme-aware avatar classes
export function getAvatarClasses(themeColor?: string): string {
  if (themeColor) {
    setThemeColors(themeColor)
    return 'avatar-gradient'
  }
  return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
}

// Get theme-aware button classes
export function getThemeButtonClasses(themeColor?: string): string {
  if (themeColor) {
    setThemeColors(themeColor)
    return 'theme-primary hover:opacity-90'
  }
  return 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
}
