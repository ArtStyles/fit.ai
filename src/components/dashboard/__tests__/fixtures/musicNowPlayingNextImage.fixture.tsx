import type { ImgHTMLAttributes } from 'react'

type FixtureImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  unoptimized?: boolean
}

export default function FixtureImage({ unoptimized: _unoptimized, ...props }: FixtureImageProps) {
  return <img {...props} />
}
