import { forwardRef, type ImgHTMLAttributes } from 'react'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | { src: string }; fill?: boolean; priority?: boolean; quality?: number; unoptimized?: boolean; placeholder?: string; blurDataURL?: string; onLoadingComplete?: (image: HTMLImageElement) => void }
export default forwardRef<HTMLImageElement, Props>(function LocalImage({ src, fill, priority, quality: _quality, unoptimized: _unoptimized, placeholder: _placeholder, blurDataURL: _blur, onLoadingComplete, onLoad, style, ...props }, ref) {
  return <img ref={ref} {...props} src={typeof src === 'string' ? src : src.src} loading={priority ? 'eager' : props.loading ?? 'lazy'} style={{ ...(fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : {}), ...style }} onLoad={event => { onLoad?.(event); onLoadingComplete?.(event.currentTarget) }} />
})
