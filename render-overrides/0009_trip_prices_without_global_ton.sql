alter table freight_prices
  drop constraint if exists freight_prices_mode_check;

alter table freight_prices
  add constraint freight_prices_mode_check
  check (mode in ('trip', 'cegonha', 'caixinha'));

delete from freight_prices where mode = 'ton';

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

update trips t
set price_per_trip = fp.price
from freight_prices fp
where fp.mode = t.freight_mode
  and t.freight_mode in ('trip', 'cegonha', 'caixinha')
  and fp.price > 0;
