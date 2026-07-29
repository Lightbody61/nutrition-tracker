import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const allowedOrigins = new Set(['https://nutrition-tracker.jodydmccord.workers.dev','https://lightbody61.github.io']);
const allowedSort = new Set(['email','createdAt','lastSignInAt','lastSeenAt','status','activeDays','sessionCount','trackedDays','lastTrackedDate']);
const forbiddenKeys = new Set(['password','password_hash','encrypted_password','access_token','refresh_token','identities','app_metadata','user_metadata','provider_token']);

function corsHeaders(request: Request) {
  const origin=request.headers.get('Origin');
  return {'Content-Type':'application/json','Access-Control-Allow-Origin':origin&&allowedOrigins.has(origin)?origin:'https://nutrition-tracker.jodydmccord.workers.dev','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
}
function reply(request:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:corsHeaders(request)});}
function statusFor(lastSeen:string|null){if(!lastSeen)return 'never_active';const age=Date.now()-Date.parse(lastSeen);if(age<=5*60_000)return 'active_now';if(age<=24*60*60_000)return 'recently_active';return 'offline';}
function trackedDates(state:unknown){
  if(!state||typeof state!=='object')return [] as string[];
  const record=state as Record<string,unknown>,dates=new Set<string>();
  for(const key of ['entries','exercises','dailyWeights'])for(const item of Array.isArray(record[key])?record[key] as Array<Record<string,unknown>>:[]){const value=typeof item?.date==='string'?item.date:'';if(/^\d{4}-\d{2}-\d{2}$/.test(value))dates.add(value);}
  return [...dates].sort();
}
function assertSafe(value:unknown){if(!value||typeof value!=='object')return;for(const [key,nested] of Object.entries(value)){if(forbiddenKeys.has(key))throw new Error('forbidden-response-field');assertSafe(nested);}}

Deno.serve(async(request)=>{
  const origin=request.headers.get('Origin');
  if(origin&&!allowedOrigins.has(origin))return reply(request,{error:'Origin not allowed.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='POST')return reply(request,{error:'Method not allowed.'},405);
  const authorization=request.headers.get('Authorization')||'',url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!authorization.startsWith('Bearer ')||!url||!anon||!service)return reply(request,{error:'Authentication required.'},401);
  const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error:authError}=await auth.auth.getUser();
  if(authError||!user)return reply(request,{error:'Authentication required.'},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const role=await admin.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(role.error)return reply(request,{error:'Administrator authorization could not be verified.'},500);
  if(!role.data)return reply(request,{error:'Administrator access is required.'},403);
  let input:Record<string,unknown>={};try{input=await request.json();}catch{return reply(request,{error:'Invalid request body.'},400);}
  if(input.action==='status')return reply(request,{isAdmin:true});
  const page=Math.max(1,Math.floor(Number(input.page)||1)),pageSize=Math.min(100,Math.max(10,Math.floor(Number(input.pageSize)||25))),search=String(input.search||'').trim().toLowerCase().slice(0,254),filter=String(input.status||'all'),sort=allowedSort.has(String(input.sort))?String(input.sort):'createdAt',direction=input.direction==='asc'?'asc':'desc';
  if(!['all','active_now','recently_active','offline','never_active'].includes(filter))return reply(request,{error:'Invalid status filter.'},400);
  try{
    const authUsers=[] as Array<{id:string,email?:string;created_at:string;last_sign_in_at?:string|null}>;let authPage=1;
    while(authPage<=50){const result=await admin.auth.admin.listUsers({page:authPage,perPage:1000});if(result.error)throw result.error;authUsers.push(...result.data.users.map(u=>({id:u.id,email:u.email,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at})));if(result.data.users.length<1000)break;authPage++;}
    const ids=authUsers.map(item=>item.id),activityMap=new Map<string,Record<string,unknown>>(),daysMap=new Map<string,number>(),trackerMap=new Map<string,string[]>();
    for(let offset=0;offset<ids.length;offset+=500){const batch=ids.slice(offset,offset+500);if(!batch.length)continue;
      const [activities,days,states]=await Promise.all([admin.from('user_activity').select('user_id,last_seen_at,session_started_at,last_page,session_count').in('user_id',batch),admin.from('user_activity_days').select('user_id,activity_date').in('user_id',batch),admin.from('tracker_states').select('user_id,tracker_state').in('user_id',batch)]);
      if(activities.error||days.error||states.error)throw activities.error||days.error||states.error;
      for(const row of activities.data||[])activityMap.set(row.user_id,row);for(const row of days.data||[])daysMap.set(row.user_id,(daysMap.get(row.user_id)||0)+1);for(const row of states.data||[])trackerMap.set(row.user_id,trackedDates(row.tracker_state));
    }
    let users=authUsers.map(item=>{const activity=activityMap.get(item.id),dates=trackerMap.get(item.id)||[],lastSeenAt=activity&&typeof activity.last_seen_at==='string'?activity.last_seen_at:null;return {id:item.id,email:item.email||'',createdAt:item.created_at,lastSignInAt:item.last_sign_in_at||null,lastSeenAt,status:statusFor(lastSeenAt),activeDays:daysMap.get(item.id)||0,sessionCount:Number(activity?.session_count)||0,trackedDays:dates.length,lastTrackedDate:dates.at(-1)||null};});
    const now=Date.now(),summary={totalUsers:users.length,activeNow:users.filter(u=>u.status==='active_now').length,active24Hours:users.filter(u=>u.lastSeenAt&&now-Date.parse(u.lastSeenAt)<=86400000).length,active7Days:users.filter(u=>u.lastSeenAt&&now-Date.parse(u.lastSeenAt)<=604800000).length,new30Days:users.filter(u=>now-Date.parse(u.createdAt)<=2592000000).length};
    if(search)users=users.filter(u=>u.email.toLowerCase().includes(search));if(filter!=='all')users=users.filter(u=>u.status===filter);
    users.sort((a,b)=>{const av=(a as Record<string,unknown>)[sort],bv=(b as Record<string,unknown>)[sort];const result=String(av??'').localeCompare(String(bv??''),undefined,{numeric:true,sensitivity:'base'});return direction==='asc'?result:-result;});
    const total=users.length,start=(page-1)*pageSize,response={isAdmin:true,summary,users:users.slice(start,start+pageSize),pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};assertSafe(response);return reply(request,response);
  }catch(_error){return reply(request,{error:'Administrator data could not be loaded.'},500);}
});
