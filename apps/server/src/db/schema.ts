import { relations } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Rheoson Next relational schema.
 *
 * Ownership split (from docs/migration/01-discovery.md): the *social brain*
 * (accounts, prefs, messaging, blends, likes, history, stats) lives in
 * Postgres. The *muscle* (files, downloads, track identity, stream cache)
 * stays with the services and never enters this database.
 *
 * Users are mirrored from Clerk by webhook — `_id` is the Clerk `sub`,
 * exactly like the Mongo `_id = clerk_id` contract on the current stack.
 */

/** Clerk-mirrored account. Row is created by the webhook on user.created. */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Clerk `sub` (user_…)
    username: text('username').notNull(),
    imageUrl: text('image_url'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_username_idx').on(t.username)],
);

/**
 * Non-account profile facts (display name, bio, listening visibility).
 * Kept separate from the Clerk mirror so webhook upserts never clobber
 * user-authored content.
 */
export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  bio: text('bio'),
  listeningVisibility: text('listening_visibility').notNull().default('friends'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Direct conversations. No group chats in M2 — one row per user pair,
 * ordered pair key makes lookup O(1) and prevents duplicates.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userAId: text('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: text('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('conversations_pair_key').on(t.userAId, t.userBId)],
);

/**
 * Messages. `share` carries the shared payload for track / lyrics /
 * playlist / blend cards; null for plain text. Ordering is `seq` —
 * an ever-increasing bigint per conversation — so pagination is stable
 * even when two rows share a timestamp.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    body: text('body'),
    shareType: text('share_type'), // 'track' | 'lyrics' | 'playlist' | 'album' | 'artist' | 'blend'
    sharePayload: jsonb('share_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_seq_idx').on(t.conversationId, t.seq)],
);

/** Blends — collaborative playlists. Owner manages membership; all members add tracks. */
export const blends = pgTable('blends', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  coverUrl: text('cover_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Blend membership. The owner row is implicit (blends.owner_id). */
export const blendMembers = pgTable(
  'blend_members',
  {
    blendId: uuid('blend_id')
      .notNull()
      .references(() => blends.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('blend_members_key').on(t.blendId, t.userId)],
);

/** Ordered blend tracks. `position` is maintained on insert/remove. */
export const blendTracks = pgTable(
  'blend_tracks',
  {
    blendId: uuid('blend_id')
      .notNull()
      .references(() => blends.id, { onDelete: 'cascade' }),
    trackId: text('track_id').notNull(), // videoId — normalized identity, per CLAUDE.md
    addedById: text('added_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('blend_tracks_key').on(t.blendId, t.trackId), index('blend_tracks_order_idx').on(t.blendId, t.position)],
);

/** Liked tracks (favourites), per user. */
export const likes = pgTable(
  'likes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id').notNull(),
    likedAt: timestamp('liked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('likes_key').on(t.userId, t.trackId), index('likes_user_idx').on(t.userId, t.likedAt)],
);

/** Play history — one row per completed or meaningful play event. */
export const playHistory = pgTable(
  'play_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
    secondsPlayed: integer('seconds_played'),
  },
  (t) => [index('play_history_user_idx').on(t.userId, t.playedAt)],
);

/** Artist follows, per user. */
export const followedArtists = pgTable(
  'followed_artists',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    artistId: text('artist_id').notNull(),
    followedAt: timestamp('followed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('followed_artists_key').on(t.userId, t.artistId)],
);

/** Synced preferences — same whitelist concept as services/preferences.py. */
export const preferences = pgTable('preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Relations (for drizzle query API) ─────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  preferences: one(preferences, { fields: [users.id], references: [preferences.userId] }),
  likes: many(likes),
  history: many(playHistory),
  follows: many(followedArtists),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const blendsRelations = relations(blends, ({ one, many }) => ({
  owner: one(users, { fields: [blends.ownerId], references: [users.id] }),
  members: many(blendMembers),
  tracks: many(blendTracks),
}));

export const blendMembersRelations = relations(blendMembers, ({ one }) => ({
  blend: one(blends, { fields: [blendMembers.blendId], references: [blends.id] }),
  user: one(users, { fields: [blendMembers.userId], references: [users.id] }),
}));

export const blendTracksRelations = relations(blendTracks, ({ one }) => ({
  blend: one(blends, { fields: [blendTracks.blendId], references: [blends.id] }),
  addedBy: one(users, { fields: [blendTracks.addedById], references: [users.id] }),
}));
