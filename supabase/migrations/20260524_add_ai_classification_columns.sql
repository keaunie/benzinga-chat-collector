alter table public.benzinga_messages
  add column if not exists message_type text,
  add column if not exists sentiment text,
  add column if not exists mentioned_tickers text[] not null default '{}',
  add column if not exists is_matt_message boolean not null default false,
  add column if not exists signal_strength integer not null default 1,
  add column if not exists ai_summary text,
  add column if not exists trading_day date;

create index if not exists idx_benzinga_messages_trading_day
  on public.benzinga_messages (trading_day);

create index if not exists idx_benzinga_messages_sentiment
  on public.benzinga_messages (sentiment);

create index if not exists idx_benzinga_messages_message_type
  on public.benzinga_messages (message_type);

create index if not exists idx_benzinga_messages_is_matt_message
  on public.benzinga_messages (is_matt_message);

create index if not exists idx_benzinga_messages_signal_strength
  on public.benzinga_messages (signal_strength);

update public.benzinga_messages
set trading_day = (captured_at at time zone 'America/Los_Angeles')::date
where trading_day is null
  and captured_at is not null;
