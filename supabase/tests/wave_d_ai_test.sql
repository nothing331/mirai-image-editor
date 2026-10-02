begin;
select no_plan();
insert into auth.users(id,email) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ai-a@example.test'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ai-b@example.test');
update public.profiles set status='active' where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.account_allowance_grants(account_id,allowance_key,granted_quantity,granted_by)
select id,'initial-ai-images',25,id from public.profiles where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.ai_creation_sessions(id,owner_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
update public.ai_control set enabled=true,budget_microusd=100,committed_microusd=0;
select ok(not has_function_privilege('authenticated','public.mirai_admit_ai(uuid,uuid,uuid,uuid,uuid,text,text,bigint,uuid)','execute'),'browser cannot admit paid requests directly');
select ok(not has_table_privilege('authenticated','public.ai_attempts','SELECT'),'browser cannot read raw private AI attempts');
select ok(not has_table_privilege('anon','public.ai_stage_attempts','SELECT'),'anonymous cannot read provider accounting');
select ok((select relrowsecurity from pg_class where oid='public.ai_attempts'::regclass),'attempt RLS is enabled');
select is((public.mirai_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'granted')::integer,25,'welcome grant is shared and one-time');
select lives_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('a',64),20,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') $$,'admit before provider work');
select lives_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('a',64),20,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4') $$,'same key returns same attempt');
select is((select executor_id from public.ai_attempts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,'same-key racing executor never owns existing lease');
select is((public.mirai_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'pending')::integer,1,'duplicate does not reserve another credit');
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('b',64),20,gen_random_uuid()) $$,'P0001','AI request key reused','changed payload cannot reuse key');
select throws_ok($$ select public.mirai_admit_ai('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',null,null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','creation',repeat('b',64),20,gen_random_uuid()) $$,'P0001','AI is busy','global concurrency works across users');
select throws_ok($$ select public.mirai_start_ai_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','image',21) $$,'P0001','AI stage budget reached','stage cannot exceed reserved spending');
select is(public.mirai_start_ai_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','image',15),1,'stage is durable before call');
select lives_ok($$ select public.mirai_finish_ai_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',1,'unknown',null) $$,'unknown outcome remains conservatively billed');
select lives_ok($$ select public.mirai_finish_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','failed',0) $$,'failed request with uncertain stage becomes unknown');
select is((select status from public.ai_attempts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),'unknown','unknown stage cannot trigger a credit refund');
select is((select committed_microusd from public.ai_control where id),15::bigint,'uncertain provider ceiling is recorded globally');
select is((public.mirai_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'pending')::integer,1,'uncertain user credit remains pending');
update public.ai_attempts set lease_until=now()-interval '1 minute' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
select lives_ok($$ select public.mirai_reconcile_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','failed',0,'Provider confirmed no recoverable result') $$,'operator can resolve failure after lease expiration');
select is((public.mirai_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'pending')::integer,0,'reconciliation restores the user credit');
select is((select committed_microusd from public.ai_control where id),15::bigint,'courtesy refund never erases provider spend');
select is((select count(*) from public.ai_reconciliation_log),1::bigint,'reconciliation leaves audit evidence');
update public.ai_control set budget_microusd=20;
select throws_ok($$ select public.mirai_admit_ai('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',null,null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','creation',repeat('b',64),10,gen_random_uuid()) $$,'P0001','global AI budget reached','aggregate spending survives user refunds');
update public.ai_control set budget_microusd=100;
select lives_ok($$ select public.mirai_admit_ai('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',null,null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','creation',repeat('b',64),10,gen_random_uuid()) $$,'another request can enter after reconciliation');
select throws_ok($$ select public.mirai_finish_ai('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','ready',100) $$,'P0001','stored AI result required','success cannot acknowledge unstored result');
select public.mirai_start_ai_stage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','image',10);
update public.ai_attempts set lease_until=now()-interval '1 minute' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
select public.mirai_expire_ai_leases();
select is((select status from public.ai_attempts where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),'unknown','server termination fences abandoned lease');
select is((select committed_microusd from public.ai_control where id),25::bigint,'terminated stage retains spending ceiling');
select throws_ok($$ select public.mirai_finish_ai('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','ready',100) $$,'P0001','AI completion fenced','late completion cannot resurrect fenced attempt');
select is(public.mirai_claim_ai_cleanup('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),null::text,'unknown result reservation cannot be cleaned prematurely');
select lives_ok($$ select public.mirai_reconcile_ai('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','failed',0,'Provider failed after process termination') $$,'resolve terminated request safely');
select is(public.mirai_claim_ai_cleanup('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/result.json','cleanup is fenced by durable status');
select lives_ok($$ select public.mirai_finish_ai_cleanup('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2') $$,'release storage only after absence is confirmed');
select is((select storage_bytes from public.ai_attempts where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),0::bigint,'physical cleanup frees quota');
delete from public.ai_attempts where owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select committed_microusd from public.ai_control where id),25::bigint,'account data deletion cannot replenish the global provider budget');

select ok(not has_function_privilege('authenticated','public.mirai_create_ai_session(uuid)','execute'),'browser cannot create uncontrolled sessions');
select is(public.mirai_create_ai_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),public.mirai_create_ai_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'creation session endpoint reuses one live session');
insert into public.ai_attempts(id,owner_id,creation_session_id,workflow,executor_id,digest,status,credit_state,storage_bytes,budget_reserved,result_key)
select gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',gen_random_uuid(),repeat('a',64),'expired','spent',0,0,'exhausted/'||n from generate_series(1,25) n;
select is((public.mirai_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'spent')::integer,25,'exhausted account has 25 spent welcome credits');
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','AI credit allowance reached','no twenty-sixth preview can be admitted');
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','AI credit allowance reached','repeated admission cannot replenish credits');

-- Owner exemption is determined by the trusted active profile, never browser metadata.
select ok(not public.mirai_has_unlimited_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'ordinary member has finite allowances');
select ok(not has_function_privilege('authenticated','public.mirai_has_unlimited_account(uuid)','execute'),'browser cannot resolve or choose privileged exemptions');
update public.profiles set account_role='owner' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.account_allowance_grants where account_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(public.mirai_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'unlimited','true','owner usage explicitly reports unlimited without a grant');
select is(public.mirai_account_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'projectLimit',null::text,'owner has no numeric project allowance');
select is(public.mirai_account_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'limitBytes',null::text,'owner has no numeric account storage allowance');
select is((public.mirai_account_usage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')->>'projectLimit')::integer,5,'member still has five projects');
select is((public.mirai_account_usage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')->>'limitBytes')::integer,104857600,'member still has 100 MiB storage');
update public.profiles set account_role='owner' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.account_allowance_grants where account_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.ai_creation_sessions set expires_at=now()-interval '1 minute' where owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select lives_ok($$ select public.mirai_create_ai_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,'owner without a grant can start a fresh creation session');
insert into public.ai_attempts(id,owner_id,creation_session_id,workflow,executor_id,digest,status,credit_state,storage_bytes,budget_reserved,result_key)
select gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',gen_random_uuid(),repeat('a',64),'expired','released',0,0,'owner-rate/'||n from generate_series(1,40) n;
insert into public.asset_uploads
(id,owner_id,request_key,state,declared_bytes,reserved_bytes,actual_bytes,original_name,original_mime,source_sha256,base_sha256,source_bytes,base_bytes,width,height,staging_key,source_key,base_key,staging_deleted_at)
select gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'ready',100,31457380,15000100,'owner-'||n||'.png','image/png',repeat('a',64),repeat('b',64),100,15000000,10,10,gen_random_uuid()::text,gen_random_uuid()::text,gen_random_uuid()::text,now() from generate_series(1,8) n;
select lives_ok($$ do $body$ declare n integer; begin for n in 1..7 loop
 perform public.mirai_create_cloud_project('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),gen_random_uuid(),(select id from public.asset_uploads where original_name='owner-'||n||'.png'),'Admin '||n);
 end loop; end $body$ $$,'owner can create more than five projects');
select is((select count(*) from public.cloud_projects where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),7::bigint,'all seven owner projects are retained');
select public.mirai_trash_project('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from public.cloud_projects where name='Admin 1'));
select lives_ok($$ select public.mirai_restore_project('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from public.cloud_projects where name='Admin 1')) $$,'owner restores a seventh active project');
select lives_ok($$ select public.mirai_reserve_original_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),gen_random_uuid(),'extra.png','image/png',100) $$,'owner can reserve an original beyond 100 MiB');
select lives_ok($$ select public.mirai_reserve_cloud_edit_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from public.cloud_projects where name='Admin 1'),gen_random_uuid(),gen_random_uuid(),repeat('a',64),repeat('b',64),100,10,10) $$,'owner can save an edit beyond 100 MiB');
select lives_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'owner can generate past project, credit, storage and hourly member caps without a grant');
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','AI is busy','owner still obeys global execution concurrency');
select public.mirai_finish_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','failed',0);
select public.mirai_finish_ai_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5');
insert into public.ai_attempts(id,owner_id,project_id,input_version_id,workflow,executor_id,digest,status,credit_state,storage_bytes,budget_reserved,result_key)
select gen_random_uuid(),p.owner_id,p.id,p.current_version_id,'extend-analysis',gen_random_uuid(),repeat('a',64),'expired','none',0,0,'owner-analysis/'||n
from public.cloud_projects p cross join generate_series(1,25) n where name='Admin 1';
select lives_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',(select id from public.cloud_projects where name='Admin 1'),(select current_version_id from public.cloud_projects where name='Admin 1'),null,'extend-analysis',repeat('e',64),0,gen_random_uuid()) $$,'owner can run a twenty-sixth scene analysis without preview credits');
select public.mirai_finish_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','failed',0);
select public.mirai_finish_ai_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6');
update public.ai_control set budget_microusd=committed_microusd;
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),1,gen_random_uuid()) $$,'P0001','global AI budget reached','unlimited owner cannot bypass global provider funding');
update public.ai_control set enabled=false;
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','AI is disabled','owner still obeys the off switch');
update public.ai_control set enabled=true;
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','creation session not found','owner exemption cannot access another account session');
insert into public.ai_attempts(id,owner_id,creation_session_id,workflow,executor_id,digest,status,credit_state,storage_bytes,budget_reserved,result_key)
select gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',gen_random_uuid(),repeat('a',64),'expired','released',41943040,0,'owner-capacity/'||n from generate_series(1,18) n;
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','global storage allowance reached','owner still obeys global storage capacity');
update public.profiles set status='revoked' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select ok(not public.mirai_has_unlimited_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'revoked owner loses the exemption immediately');
select throws_ok($$ select public.mirai_admit_ai('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','creation',repeat('e',64),0,gen_random_uuid()) $$,'P0001','account is not eligible','revoked owner cannot execute AI');

select * from finish();
rollback;
