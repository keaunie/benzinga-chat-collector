create table if not exists public.benzinga_messages (
  id text primary key,
  username text,
  timestamp_text text,
  message text,
  captured_at timestamptz,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_benzinga_messages_captured_at
  on public.benzinga_messages (captured_at);

create index if not exists idx_benzinga_messages_source
  on public.benzinga_messages (source);

create table if not exists public.benzinga_reports (
  id text primary key,
  report_type text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  message_count integer not null default 0,
  report_text text,
  status text not null default 'completed',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_benzinga_reports_window
  on public.benzinga_reports (window_start, window_end);

create index if not exists idx_benzinga_reports_type
  on public.benzinga_reports (report_type, created_at);
