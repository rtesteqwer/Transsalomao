-- Salomão IA: servidor pode guardar segredos de integração fora do APK e do repositório.
create table if not exists assistant_secrets (
  name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);
