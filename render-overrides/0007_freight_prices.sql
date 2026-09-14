create table if not exists freight_prices (
  mode text primary key,
  price double precision not null default 0,
  updated_at timestamptz not null default now(),
  constraint freight_prices_mode_check check (mode in ('cegonha', 'caixinha')),
  constraint freight_prices_price_check check (price >= 0)
);

insert into freight_prices (mode, price)
values (
  'cegonha',
  coalesce(
    (
      select price_per_trip
      from trips
      where freight_mode = 'cegonha' and price_per_trip > 0
      order by date desc, code desc
      limit 1
    ),
    0
  )
)
on conflict (mode) do nothing;

insert into freight_prices (mode, price)
values (
  'caixinha',
  coalesce(
    (
      select price_per_trip
      from trips
      where freight_mode = 'caixinha' and price_per_trip > 0
      order by date desc, code desc
      limit 1
    ),
    0
  )
)
on conflict (mode) do nothing;
