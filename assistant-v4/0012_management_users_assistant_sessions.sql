-- Salomão IA v4: usuários de gerenciamento editáveis e sessões de dispositivo revogáveis.
create table if not exists management_users (
  id text primary key,
  username text not null,
  password_hash text not null,
  role text not null default 'admin',
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists management_users_username_lower_uq
  on management_users ((lower(username)));

insert into management_users (id, username, password_hash, role, status)
values
  ('adm_felipe', 'Felipe', '3d14c2d4e4ced81e459e4ace7c01466a700000fb94a3bbe944a55fb92693e879', 'admin', 'ativo'),
  ('adm_emanuel', 'Emanuel', '0013fa1710b8b0e4816d6eaad9668dab6dfa7ea9f1d07291fa5072e857e94522', 'admin', 'ativo'),
  ('adm_murillo', 'Murillo', '58f966a9a6f34334c5d70a548d1c04674296c826c5c5162d49425ce2fe9b78cf', 'admin', 'ativo')
on conflict (id) do nothing;

create table if not exists assistant_sessions (
  token_hash text primary key,
  username text not null,
  device_label text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists assistant_sessions_expiry_idx on assistant_sessions (expires_at);
create index if not exists assistant_sessions_user_idx on assistant_sessions ((lower(username)));
