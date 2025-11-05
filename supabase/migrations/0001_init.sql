create table if not exists telemetry (
  id bigserial primary key,
  device_id text not null,
  ts timestamptz not null default now(),
  gas_ppm float8[] null,
  danger boolean not null default false,
  meta jsonb null
);
alter table telemetry enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='anon read on telemetry') then
    create policy "anon read on telemetry" on telemetry for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='edge insert on telemetry') then
    create policy "edge insert on telemetry" on telemetry for insert with check (true);
  end if;
end $$; 