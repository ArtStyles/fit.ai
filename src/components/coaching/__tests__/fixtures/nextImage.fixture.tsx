import type { ImgHTMLAttributes } from 'react'

type FixtureImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string }
  fill?: boolean
}

export default function FixtureImage({ src, fill: _fill, ...props }: FixtureImageProps) {
  return <img src={typeof src === 'string' ? src : src.src} {...props} />
}
