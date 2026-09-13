insert into drivers (id, name, phone, category, status, commission_pct)
select 'drv_klebersom_dutra', 'Klebersom Dutra', '', 'E', 'ativo', 0
where not exists (
  select 1 from drivers
  where lower(name) in ('klebersom dutra', 'klebesom dutra')
     or lower(name) like 'kleber% dutra'
);

insert into fleets (id, name, tractor_plate, trailer_plate, model, status)
select 'flt_volvo_klebersom', 'VOLVO KLEBERSOM', '', '', 'Volvo', 'ativo'
where not exists (
  select 1 from fleets
  where lower(name) = 'volvo klebersom'
     or (lower(name) like '%volvo%' and lower(name) like '%kleber%')
);
