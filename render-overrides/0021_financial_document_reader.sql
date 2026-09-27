alter table expenses
  add column if not exists transaction_time text;

alter table expenses
  drop constraint if exists expenses_transaction_time_format;

alter table expenses
  add constraint expenses_transaction_time_format
  check (transaction_time is null or transaction_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$');
