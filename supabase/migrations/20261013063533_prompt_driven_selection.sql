-- Prompt selection resolves its operation only after an owned, budgeted visual plan.
alter table public.ai_attempts drop constraint ai_attempts_workflow_check;
alter table public.ai_attempts add constraint ai_attempts_workflow_check check (workflow in ('selection','remove','replace','restyle','transform','extend','extend-analysis','creation'));
alter table public.ai_attempts add column resolved_operation text check (resolved_operation in ('recolor','remove','replace','restyle'));
alter table public.ai_attempts add constraint ai_attempts_selection_resolution_check check (
  (resolved_operation is null or workflow='selection')
  and (workflow<>'selection' or status not in ('ready','accepted') or resolved_operation is not null)
);
alter table public.ai_stage_attempts drop constraint ai_stage_attempts_stage_check;
alter table public.ai_stage_attempts add constraint ai_stage_attempts_stage_check check (stage in ('selection-plan','replace-plan','transform-plan','transform-fidelity','extend-analysis','image'));

create or replace function public.mirai_start_ai_stage(target_owner uuid,target_id uuid,target_stage text,target_cost bigint,target_configuration jsonb default '{}'::jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts; ordinal integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 select * into a from public.ai_attempts where id=target_id and owner_id=target_owner for update;
 if not found or a.status<>'running' or a.lease_until<=now() then raise exception 'AI lease expired'; end if;
 if not (select enabled from public.ai_control where id)
 or not exists(select 1 from public.profiles where id=target_owner and status='active')
 or (a.project_id is not null and not exists(select 1 from public.cloud_projects where id=a.project_id and owner_id=target_owner and status='active' and current_version_id=a.input_version_id))
 then raise exception 'AI access revoked'; end if;
 if target_cost<0 or target_cost>a.budget_reserved then raise exception 'AI stage budget reached'; end if;
 select count(*)+1 into ordinal from public.ai_stage_attempts where attempt_id=target_id;
 if ordinal > (case when a.workflow='transform' then 3 when a.workflow in ('replace','selection') then 2 else 1 end) then raise exception 'AI stage allowance reached'; end if;
 if a.workflow='selection' and ((ordinal=1 and target_stage not in ('selection-plan','image')) or (ordinal=2 and target_stage<>'image')) then raise exception 'invalid selection stage'; end if;
 insert into public.ai_stage_attempts(attempt_id,ordinal,stage,cost_microusd,configuration) values(target_id,ordinal,target_stage,target_cost,target_configuration);
 -- Keep the total reservation until completion; finished stages reduce the remaining portion.
 return ordinal;
end;
$$;

create or replace function public.mirai_accept_cloud_edit(
  target_owner uuid, target_project uuid, target_input uuid,
  target_output uuid, target_operation uuid, target_asset uuid,
  target_request_key uuid, target_digest text, target_kind text,
  target_parameters jsonb, target_mask_width integer, target_mask_height integer,
  target_mask_base64 text, target_replace_future boolean
) returns public.cloud_commit_receipts
language plpgsql security invoker set search_path = '' as $$
declare project_row public.cloud_projects;
declare asset_row public.cloud_edit_assets;
declare input_row public.cloud_project_versions;
declare existing public.cloud_commit_receipts;
declare receipt public.cloud_commit_receipts;
declare next_sequence bigint;
declare ai_row public.ai_attempts;
begin
  select * into project_row from public.cloud_projects
    where id = target_project and owner_id = target_owner and status = 'active' for update;
  if not found or not exists (select 1 from public.profiles where id = target_owner and status = 'active') then
    raise exception 'owned active project not found';
  end if;
  select * into existing from public.cloud_commit_receipts
    where owner_id = target_owner and project_id = target_project and request_key = target_request_key;
  if found then
    if existing.digest <> target_digest then raise exception 'edit request key reused with different payload'; end if;
    return existing;
  end if;
  if target_parameters ? 'diagnosticRequestId' then
    select * into ai_row from public.ai_attempts where id=(target_parameters->>'diagnosticRequestId')::uuid and owner_id=target_owner for update;
    if not found or ai_row.project_id<>target_project or ai_row.input_version_id<>target_input or (case when ai_row.workflow='selection' then ai_row.resolved_operation is distinct from target_kind else ai_row.workflow<>target_kind end)
      or ai_row.status<>'ready' or ai_row.expires_at<=now() then raise exception 'ready owned AI result required'; end if;
  elsif target_kind in ('remove','replace','restyle','extend') then raise exception 'AI result required';
  end if;
  if project_row.current_version_id <> target_input then raise exception 'edit input is not current'; end if;
  if project_row.current_version_id <> project_row.head_version_id and not target_replace_future then
    raise exception 'redo replacement requires acknowledgement';
  end if;
  select * into input_row from public.cloud_project_versions
    where project_id = target_project and owner_id = target_owner and id = target_input and active;
  if not found then raise exception 'active input version not found'; end if;
  select * into asset_row from public.cloud_edit_assets
    where id = target_asset and project_id = target_project and owner_id = target_owner
      and request_key = target_request_key and digest = target_digest and state in ('ready', 'committed') for update;
  if not found then raise exception 'ready edit asset not found'; end if;
  if target_kind not in ('recolor','paint','crop','resize','rotate','flip','text','watermark','transform','remove','replace','restyle','extend')
    or target_parameters is null or pg_catalog.jsonb_typeof(target_parameters) <> 'object'
    or target_mask_width <> input_row.width or target_mask_height <> input_row.height
    or target_mask_base64 is null or pg_catalog.length(target_mask_base64) < 1 then
    raise exception 'invalid edit operation';
  end if;
  if project_row.current_version_id <> project_row.head_version_id then
    update public.cloud_project_versions set active = false
      where project_id = target_project and sequence > input_row.sequence and active;
  end if;
  select coalesce(max(sequence), 0) + 1 into next_sequence
    from public.cloud_project_versions where project_id = target_project;
  insert into public.cloud_project_versions
    (id, project_id, owner_id, upload_id, edit_asset_id, parent_version_id, kind, width, height, sequence)
  values (target_output, target_project, target_owner, null, target_asset, target_input,
    'edit', asset_row.width, asset_row.height, next_sequence);
  insert into public.cloud_edit_operations
    (id, project_id, owner_id, input_version_id, output_version_id, kind, method,
     parameters, mask_width, mask_height, mask_deflate)
  values (target_operation, target_project, target_owner, target_input, target_output,
    target_kind, case when ai_row.id is null or target_kind='recolor' then 'local' else 'generative' end, target_parameters, target_mask_width, target_mask_height,
    pg_catalog.decode(target_mask_base64, 'base64'));
  update public.cloud_edit_assets set state = 'committed', updated_at = now()
    where id = target_asset;
  update public.cloud_projects set current_version_id = target_output,
    head_version_id = target_output, revision = revision + 1, updated_at = now()
    where id = target_project and owner_id = target_owner
    returning * into project_row;
  insert into public.cloud_commit_receipts
    (owner_id, project_id, request_key, digest, input_version_id,
     output_version_id, operation_id, revision)
  values (target_owner, target_project, target_request_key, target_digest,
    target_input, target_output, target_operation, project_row.revision)
  returning * into receipt;
  if ai_row.id is not null then
    update public.ai_attempts set status='accepted',accepted_output_id=target_output,updated_at=now() where id=ai_row.id;
  end if;
  return receipt;
end;
$$;
