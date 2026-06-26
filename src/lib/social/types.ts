// Tipos compartidos entre Server Actions y UI.

import type { SessionSnapshot, RoutineSnapshot } from './snapshots'

export interface PostAuthor {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

export interface FeedPost {
  id: string
  author: PostAuthor
  body: string | null
  photo_urls: string[]
  session_snapshot: SessionSnapshot | null
  routine_snapshot: RoutineSnapshot | null
  like_count: number
  comment_count: number
  liked_by_me: boolean
  is_mine: boolean
  created_at: string
}

export interface FeedPage {
  posts: FeedPost[]
  nextCursor: string | null
}

export interface PostCommentView {
  id: string
  author: PostAuthor
  body: string
  created_at: string
  is_mine: boolean
}

export interface PostDetail {
  post: FeedPost
  comments: PostCommentView[]
}

import type { FollowState } from './follow'
export type SuggestedUser = PostAuthor & { isPrivate: boolean; followState: FollowState }

export type RequestUser = PostAuthor & { isPrivate: boolean }
