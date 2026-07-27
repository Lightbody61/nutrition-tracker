-- Run manually in the Supabase SQL editor before deploying this browser release.
-- The function is SECURITY INVOKER, derives identity from auth.uid(), and remains subject to RLS.

create or replace function public.save_tracker_state_if_version_matches(
  p_tracker_state jsonb,
  p_schema_version integer,
  p_expected_updated_at timestamptz
)
returns table(success boolean, conflict boolean, new_updated_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_tracker_state is null or p_schema_version is null then
    raise exception 'Tracker state and schema version are required' using errcode = '22004';
  end if;

  if p_expected_updated_at is null then
    insert into public.tracker_states(user_id, tracker_state, schema_version, updated_at)
    values (v_user_id, p_tracker_state, p_schema_version, clock_timestamp())
    on conflict (user_id) do nothing
    returning updated_at into v_updated_at;
  else
    update public.tracker_states
       set tracker_state = p_tracker_state,
           schema_version = p_schema_version,
           updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where user_id = v_user_id
       and updated_at = p_expected_updated_at
    returning updated_at into v_updated_at;
  end if;

  if v_updated_at is null then
    return query select false, true, null::timestamptz;
  else
    return query select true, false, v_updated_at;
  end if;
end;
$$;

revoke all on function public.save_tracker_state_if_version_matches(jsonb, integer, timestamptz) from public;
revoke all on function public.save_tracker_state_if_version_matches(jsonb, integer, timestamptz) from anon;
grant execute on function public.save_tracker_state_if_version_matches(jsonb, integer, timestamptz) to authenticated;
