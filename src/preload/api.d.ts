import type { FabulistAPI } from './index'

declare global {
  interface Window {
    fabulist: FabulistAPI
  }
}

export {}
