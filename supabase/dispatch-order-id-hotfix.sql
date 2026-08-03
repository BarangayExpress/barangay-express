-- Barangay Express V4 hotfix: resolve ambiguous order_id in advance_smart_dispatch
-- Safe to run once or repeatedly in Supabase SQL Editor.

create or replace function public.advance_smart_dispatch(
  p_order_id bigint,
  p_offer_seconds integer default 20
)
returns table (
  order_id bigint,
  state text,
  current_rider_id uuid,
  current_rank integer,
  offer_expires_at timestamptz,
  distance_meters numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_job public.dispatch_jobs;
  v_next public.dispatch_candidates;
  v_offer_seconds integer := greatest(10, least(coalesce(p_offer_seconds, 20), 120));
begin
  perform pg_advisory_xact_lock(p_order_id);

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then return; end if;

  if coalesce(v_order.status, 'Pending') <> 'Pending' or v_order.assigned_rider is not null then
    update public.dispatch_jobs
      set state = 'accepted', current_rider_id = v_order.assigned_rider,
          offer_expires_at = null, updated_at = now()
      where dispatch_jobs.order_id = p_order_id;
    return query
      select j.order_id, j.state, j.current_rider_id, j.current_rank,
             j.offer_expires_at, c.distance_meters
      from public.dispatch_jobs j
      left join public.dispatch_candidates c
        on c.order_id = j.order_id and c.rider_id = j.current_rider_id
      where j.order_id = p_order_id;
    return;
  end if;

  insert into public.dispatch_jobs(order_id, state)
  values (p_order_id, 'searching')
  on conflict on constraint dispatch_jobs_pkey do nothing;

  if not exists (select 1 from public.dispatch_candidates where dispatch_candidates.order_id = p_order_id) then
    insert into public.dispatch_candidates(order_id, rider_id, candidate_rank, distance_meters)
    select p_order_id, ranked.id, ranked.rn, ranked.distance_meters
    from (
      select rp.id,
        row_number() over (
          order by
            case when rl.updated_at >= now() - interval '15 minutes' then 0 else 1 end,
            case when v_order.pickup_latitude is not null and v_order.pickup_longitude is not null
                      and rl.latitude is not null and rl.longitude is not null
                 then 6371000 * 2 * asin(sqrt(
                   power(sin(radians((rl.latitude - v_order.pickup_latitude)::numeric) / 2), 2) +
                   cos(radians(v_order.pickup_latitude::numeric)) * cos(radians(rl.latitude::numeric)) *
                   power(sin(radians((rl.longitude - v_order.pickup_longitude)::numeric) / 2), 2)
                 ))
                 else 999999999 end,
            rp.last_online_at desc nulls last,
            rp.id
        )::integer as rn,
        case when v_order.pickup_latitude is not null and v_order.pickup_longitude is not null
                  and rl.latitude is not null and rl.longitude is not null
             then 6371000 * 2 * asin(sqrt(
               power(sin(radians((rl.latitude - v_order.pickup_latitude)::numeric) / 2), 2) +
               cos(radians(v_order.pickup_latitude::numeric)) * cos(radians(rl.latitude::numeric)) *
               power(sin(radians((rl.longitude - v_order.pickup_longitude)::numeric) / 2), 2)
             ))
             else null end as distance_meters
      from public.rider_profiles rp
      left join public.rider_locations rl on rl.rider_id = rp.id
      where rp.is_active = true and rp.is_online = true
        and not exists (
          select 1 from public.orders active_order
          where active_order.assigned_rider = rp.id
            and active_order.status in ('Accepted','Heading to Pickup','Picked Up','In Transit','Delivered')
        )
    ) ranked;
  end if;

  select * into v_job from public.dispatch_jobs where dispatch_jobs.order_id = p_order_id for update;

  if v_job.state = 'offered' and v_job.offer_expires_at > now()
     and exists (
       select 1 from public.rider_profiles rp
       where rp.id = v_job.current_rider_id and rp.is_active and rp.is_online
     ) then
    return query
      select j.order_id, j.state, j.current_rider_id, j.current_rank,
             j.offer_expires_at, c.distance_meters
      from public.dispatch_jobs j
      left join public.dispatch_candidates c
        on c.order_id = j.order_id and c.rider_id = j.current_rider_id
      where j.order_id = p_order_id;
    return;
  end if;

  select * into v_next
  from public.dispatch_candidates c
  where c.order_id = p_order_id
    and c.candidate_rank > coalesce(v_job.current_rank, 0)
    and exists (
      select 1 from public.rider_profiles rp
      where rp.id = c.rider_id and rp.is_active and rp.is_online
    )
    and not exists (
      select 1 from public.orders active_order
      where active_order.assigned_rider = c.rider_id
        and active_order.status in ('Accepted','Heading to Pickup','Picked Up','In Transit','Delivered')
    )
  order by c.candidate_rank
  limit 1;

  if v_next.rider_id is null then
    update public.dispatch_jobs
      set state = 'exhausted', current_rider_id = null,
          offer_expires_at = null, updated_at = now()
      where dispatch_jobs.order_id = p_order_id;
  else
    update public.dispatch_jobs
      set state = 'offered', current_rider_id = v_next.rider_id,
          current_rank = v_next.candidate_rank,
          offer_expires_at = now() + make_interval(secs => v_offer_seconds),
          attempt_count = attempt_count + 1, updated_at = now()
      where dispatch_jobs.order_id = p_order_id;
  end if;

  return query
    select j.order_id, j.state, j.current_rider_id, j.current_rank,
           j.offer_expires_at, c.distance_meters
    from public.dispatch_jobs j
    left join public.dispatch_candidates c
      on c.order_id = j.order_id and c.rider_id = j.current_rider_id
    where j.order_id = p_order_id;
end;
$$;

revoke execute on function public.advance_smart_dispatch(bigint, integer) from public, anon, authenticated;
grant execute on function public.advance_smart_dispatch(bigint, integer) to service_role;
