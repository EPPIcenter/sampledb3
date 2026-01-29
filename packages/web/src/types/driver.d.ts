declare module 'driver.js' {
  export interface DriverPopover {
    title?: string
    description?: string
    showButtons?: ('previous' | 'next' | 'close')[]
    nextBtnText?: string
    onNextClick?: () => void
    onPrevClick?: () => void
    onCloseClick?: () => void
  }

  export interface DriveStep {
    element?: string
    popover?: DriverPopover
  }

  export interface DriverConfig {
    steps?: DriveStep[]
    showProgress?: boolean
    allowClose?: boolean
    onDestroyed?: () => void
  }

  export interface Driver {
    drive: (stepIndex?: number) => void
    destroy: () => void
  }

  export function driver(config?: DriverConfig): Driver
}
