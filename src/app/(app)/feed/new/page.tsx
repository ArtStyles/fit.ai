import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostComposer } from '@/components/social/PostComposer'

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Nueva publicación</h1>
      </header>
      <PostComposer />
    </div>
  )
}
