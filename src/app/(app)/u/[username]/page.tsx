import { notFound } from 'next/navigation'
import { getUserPosts } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PostCard } from '@/components/social/PostCard'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts } = await getUserPosts(username)
  if (!author) notFound()

  const name = author.full_name || author.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="flex flex-col items-center gap-3 border-b border-border/40 px-4 py-8">
        <Avatar className="h-20 w-20">
          {author.avatar_url && <AvatarImage src={author.avatar_url} alt={name} />}
          <AvatarFallback className="text-2xl">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="text-center">
          <h1 className="text-xl font-bold">{name}</h1>
          {author.username && <p className="text-sm text-muted-foreground">@{author.username}</p>}
        </div>
        <p className="text-sm text-muted-foreground">{posts.length} publicaciones</p>
      </header>
      {posts.length === 0
        ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">Sin publicaciones todavía.</p>
        : posts.map(p => <PostCard key={p.id} post={p} />)}
    </div>
  )
}
