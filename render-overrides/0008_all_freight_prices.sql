alter table freight_prices
  drop constraint if exists freight_prices_mode_check;

alter table freight_prices
  add constraint freight_prices_mode_check
  check (mode in ('ton', 'trip', 'cegonha', 'caixinha'));

insert into freight_prices (mode, price)
values (
  'ton',
  coalesce(
    (
      select price_per_ton
      from trips
      where freight_mode = 'ton' and price_per_ton > 0
      order by date desc, code desc
      limit 1
    ),
    0
  )
)
on conflict (mode) do nothing;

insert into freight_prices (mode, price)
values (
  'trip',
  coalesce(
    (
      select price_per_trip
      from trips
      where freight_mode = 'trip' and price_per_trip > 0
      order by date desc, code desc
      limit 1
    ),
    0
  )
)
on conflict (mode) do nothing;
