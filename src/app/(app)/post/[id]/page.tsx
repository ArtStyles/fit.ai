import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPostDetail } from '@/app/actions/feed'
import { PostCard } from '@/components/social/PostCard'
import { CommentList } from '@/components/social/CommentList'
import { CommentInput } from '@/components/social/CommentInput'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const detail = await getPostDetail(id)
  if (!detail) notFound()

  return (
    <div className="mx-auto max-w-lg pb-32">
      <FixedTopBar>
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Publicación</h1>
      </FixedTopBar>
      <PostCard post={detail.post} />
      <CommentList comments={detail.comments} postId={detail.post.id} />
      <CommentInput postId={detail.post.id} />
    </div>
  )
}
