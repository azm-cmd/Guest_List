import type { GuestListApi } from './index'

declare global {
  interface Window {
    guestlist: GuestListApi
  }
}
