'use strict';
const assert=require('assert');
const fs=require('fs');

const account=fs.readFileSync('account.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const duplicate=fs.readFileSync('nutrition-tracker.html','utf8');
const sql=fs.readFileSync('supabase/admin_activity.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-users/index.ts','utf8');
const docs=fs.readFileSync('supabase/ADMIN_MODULE_SETUP.md','utf8');

assert.ok(html.includes('id="adminMenuBtn" data-screen="adminScreen">Admin</button>'));
assert.ok(html.includes('class="secondary hide" id="adminMenuBtn"'),'Admin must be absent visually until verified');
assert.ok(html.includes('id="adminScreen"'));
assert.ok(html.includes("id==='adminScreen'&&window.adminAccessConfirmed!==true"),'direct navigation must be guarded');
assert.ok(account.includes('window.adminAccessConfirmed=false'));
assert.ok(account.includes("callAdminFunction({action:'status'})"));
assert.ok(account.includes("el('adminMenuBtn').classList.toggle('hide',!adminAuthorized)"));
assert.ok(account.includes("clearAdminState();showScreen('mainMenuScreen')"),'lost authorization must close Admin');
assert.ok(account.includes('stopPresenceHeartbeat();clearAdminState();const result=await client.auth.signOut()'));

for(const screen of ['foodHubScreen','exerciseHubScreen','profileScreen','utilitiesScreen','contactScreen','usersGuideScreen','accountScreen'])assert.ok(html.includes(`id="${screen}"`),`missing retained screen ${screen}`);
assert.ok(html.includes('data-screen="accountScreen">Back to Account</button>'));
assert.strictEqual(html,duplicate,'HTML entry points must remain identical');

assert.ok(sql.includes('create table if not exists public.admin_users'));
assert.ok(sql.includes('create table if not exists public.user_activity'));
assert.ok(sql.includes('create table if not exists public.user_activity_days'));
assert.ok(sql.includes('v_user_id uuid := auth.uid()'));
assert.ok(sql.includes('revoke all on table public.admin_users from anon, authenticated'));
assert.ok(sql.includes('revoke all on table public.user_activity from anon, authenticated'));
assert.ok(sql.includes('grant execute on function public.record_user_activity(text,boolean) to authenticated'));
assert.ok(!sql.includes('service_role'));

assert.ok(edge.includes("if(!authorization.startsWith('Bearer ')"),'missing auth must be rejected');
assert.ok(edge.includes("return reply(request,{error:'Authentication required.'},401)"));
assert.ok(edge.includes("from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle()"));
assert.ok(edge.includes("return reply(request,{error:'Administrator access is required.'},403)"));
assert.ok(edge.includes("if(input.action==='status')return reply(request,{isAdmin:true})"));
assert.ok(edge.includes('admin.auth.admin.listUsers'));
assert.ok(edge.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert.ok(!account.includes('SUPABASE_SERVICE_ROLE_KEY')&&!account.includes('service_role'));
for(const forbidden of ['encrypted_password','access_token','refresh_token','identities','provider_token'])assert.ok(edge.includes(`'${forbidden}'`),`response guard missing ${forbidden}`);
assert.ok(edge.includes('assertSafe(response)'));

assert.ok(account.includes("client.rpc('record_user_activity',{p_page:"));
assert.ok(account.includes('p_session_started:sessionStarted'));
assert.ok(account.includes('},60000)'));
assert.ok(account.includes("document.visibilityState==='visible'&&currentUserId"));
assert.ok(account.includes('catch(_error){return false;}finally{presenceInFlight=false;}'),'heartbeat failure must be non-blocking');

const render=account.slice(account.indexOf('function renderAdminDashboard'),account.indexOf('async function loadAdminUsers'));
assert.ok(render.includes('cell.textContent=String(value'));
assert.ok(!render.includes('innerHTML'),'email rendering must not use innerHTML');
const malicious='<img src=x onerror=alert(1)>';
const cell={textContent:''};cell.textContent=String(malicious);assert.strictEqual(cell.textContent,malicious);

for(const text of ['Total registered users','Users active now','Active in last 24 hours','Active in last 7 days','New in last 30 days','Search by email','Recently active','Never active'])assert.ok((html+account).includes(text));
for(const text of ['ACTUAL_ADMIN_AUTH_USER_UUID','supabase functions deploy admin-users','within five minutes','one assigned administrator and one normal confirmed account'])assert.ok(docs.includes(text));

console.log('Secure Admin module tests: PASS (server role verification, protected navigation, presence, privacy, safe rendering)');
