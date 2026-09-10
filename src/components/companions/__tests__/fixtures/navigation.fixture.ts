export const useSearchParams = () => new URLSearchParams(window.location.search)
export const usePathname = () => window.location.pathname
export const useRouter = () => ({ push: () => {}, replace: () => {}, refresh: () => {} })
