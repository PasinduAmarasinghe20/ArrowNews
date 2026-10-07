-- MarketPulse database schema (run in Supabase SQL Editor)
-- Free tier: 500 MB database — plenty for millions of news rows.

create table if not exists news_items (
  id           bigint generated always as identity primary key,
  title        text not null,
  url          text not null unique,
  source       text not null,
  asset_tag    text not null check (asset_tag in ('forex','crypto','gold')),
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists news_items_tag_time_idx
  on news_items (asset_tag, published_at desc);

create table if not exists messages (
  id         bigint generated always as identity primary key,
  room       text not null default 'all'
             check (room in ('all','forex','crypto','gold')),
  username   text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_time_idx
  on messages (room, created_at);

-- Realtime: broadcast new chat messages to all connected browsers
alter publication supabase_realtime add table messages;

-- Row Level Security: anyone can read news + chat; anyone can post chat
-- (username is self-declared — fine for a free community site; upgrade to
-- Supabase Auth later to get real accounts.)
alter table news_items enable row level security;
alter table messages  enable row level security;

create policy "news readable by everyone"
  on news_items for select using (true);

create policy "chat readable by everyone"
  on messages for select using (true);

create policy "anyone can post chat"
  on messages for insert with check (true);
