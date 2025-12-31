import { createContext, useContext, useState, ReactNode } from 'react'

interface HotkeyContextType {
  isHelpModalOpen: boolean
  openHelpModal: () => void
  closeHelpModal: () => void
  toggleHelpModal: () => void
  isSearchModalOpen: boolean
  openSearchModal: () => void
  closeSearchModal: () => void
  toggleSearchModal: () => void
  isCommandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void
}

const HotkeyContext = createContext<HotkeyContextType | undefined>(undefined)

export function HotkeyProvider({ children }: { children: ReactNode }) {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  const openHelpModal = () => setIsHelpModalOpen(true)
  const closeHelpModal = () => setIsHelpModalOpen(false)
  const toggleHelpModal = () => setIsHelpModalOpen(prev => !prev)

  const openSearchModal = () => setIsSearchModalOpen(true)
  const closeSearchModal = () => setIsSearchModalOpen(false)
  const toggleSearchModal = () => setIsSearchModalOpen(prev => !prev)

  const openCommandPalette = () => setIsCommandPaletteOpen(true)
  const closeCommandPalette = () => setIsCommandPaletteOpen(false)
  const toggleCommandPalette = () => setIsCommandPaletteOpen(prev => !prev)

  return (
    <HotkeyContext.Provider
      value={{
        isHelpModalOpen,
        openHelpModal,
        closeHelpModal,
        toggleHelpModal,
        isSearchModalOpen,
        openSearchModal,
        closeSearchModal,
        toggleSearchModal,
        isCommandPaletteOpen,
        openCommandPalette,
        closeCommandPalette,
        toggleCommandPalette,
      }}
    >
      {children}
    </HotkeyContext.Provider>
  )
}

export function useHotkeyContext() {
  const context = useContext(HotkeyContext)
  if (context === undefined) {
    throw new Error('useHotkeyContext must be used within a HotkeyProvider')
  }
  return context
}

