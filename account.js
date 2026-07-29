'use strict';

// Browser-safe Stage 2 configuration. Never place privileged credentials here.
const SUPABASE_URL='https://bwihhbcfthkfsogqmgdq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_7w8TBgD1TvA332ItCSI6Fg_wAoY55od';
const AUTH_REDIRECT_URL='https://nutrition-tracker.jodydmccord.workers.dev';
const TRACKER_SCHEMA_VERSION=1;
const CACHE_PREFIX='nutritionTracker.accountCache.';
const SAVE_RPC='save_tracker_state_if_version_matches';
const SAVE_DEBOUNCE_MS=1800;

(function(){
  let client=null,session=null,currentUserId=null,lastKnownUpdatedAt=null;
  let cloudReady=false,loading=false,dirty=false,saveTimer=null,recovery=false;
  let conflictRecord=null,conflictMode=null,lastLoadedUserId=null,logoutPending=false,logoutInProgress=false;
  let deletionInProgress=false,persistenceGeneration=0,saveInFlight=null;
  let stateRevision=0,followUpSaveRequested=false,queuedSaveOptions=null,sessionGeneration=0;
  let deletionOperationGeneration=0,activeDeletion=null;
  const completedDeletionUsers=new Set();
  let loadInFlight=null,loadInFlightKey=null,recoveryContext=null,forumPosting=false,forumProfile=null,forumIsAdmin=false,forumComments=[],forumProfiles=new Map(),forumAdminUsers=[],forumAdminComments=[],accountRequested=false;
  let adminAuthorized=false,adminUsers=[],adminSummary=null,adminPagination={page:1,pages:1,total:0},adminSort='createdAt',adminDirection='desc',adminSearchTimer=null;
  let presenceTimer=null,presenceInFlight=false;

  const el=id=>document.getElementById(id);
  const safeMessage=(message,type='')=>{const locked=document.body.classList.contains&&document.body.classList.contains('trackerLocked');const node=locked?el('accountMessage'):(el('profileAccountMessage')||el('cloudSaveStatus')||el('accountMessage'));if(!node)return;node.textContent=message;node.className='accountStatus'+(type?' '+type:'');};
  const cloudStatus=text=>{if(el('cloudSaveStatus'))el('cloudSaveStatus').textContent=text;setStorageStatus(text,text==='Error'||text==='Offline'||text==='Authentication expired'||text.startsWith('Conflict'))};
  const cacheKey=id=>CACHE_PREFIX+id;
  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.keys(value).sort().reduce((out,key)=>{out[key]=canonical(value[key]);return out;},{}):value);
  const statesEqual=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const friendlyError=error=>{
    const message=String(error&&error.message||'').toLowerCase();
    if(message.includes('email not confirmed'))return 'Email is not confirmed. Check your inbox, then try again.';
    if(message.includes('invalid login'))return 'Invalid email or password.';
    if(message.includes('password'))return 'Password is invalid. Use at least 8 characters.';
    if(message.includes('row-level')||message.includes('permission')||error&&error.code==='42501')return 'Cloud access was denied by the account data policy.';
    if(message.includes('jwt')||message.includes('session'))return 'Your session expired. Please log in again.';
    if(message.includes('fetch')||message.includes('network'))return 'Network unavailable. Check your connection and try again.';
    return 'The account service could not complete that request. Please try again.';
  };
  const sanitizedContactError=value=>String(value||'Contact Administrator request failed.').replace(/[\r\n]+/g,' ').slice(0,300);
  async function contactResultDetails(result){
    let data=result&&result.data&&typeof result.data==='object'?result.data:null,status=null;
    const response=result&&result.error&&result.error.context;
    if(response&&typeof response.status==='number')status=response.status;
    if(!data&&response&&typeof response.clone==='function')try{data=await response.clone().json();}catch(_e){}
    return {data,status,error:sanitizedContactError(data&&data.error||result&&result.error&&result.error.message)};
  }
  function setAuthView(user){
    document.body.classList.toggle('trackerLocked',!user);
    document.querySelectorAll('.signedOutOnly').forEach(n=>n.style.display=user?'none':'block');
    document.querySelectorAll('.signedInOnly').forEach(n=>n.style.display=user&&!recovery?'block':'none');
    document.querySelectorAll('.recoveryOnly').forEach(n=>n.style.display=recovery?'block':'none');
    if(el('signedInEmail'))el('signedInEmail').textContent=user&&user.email||'';
    if(user){const metadata=user.user_metadata||{};if(el('contactName')&&!el('contactName').value)el('contactName').value=metadata.full_name||metadata.name||'';if(el('contactEmail')&&!el('contactEmail').value)el('contactEmail').value=user.email||'';}
    if(!user){forumProfile=null;forumIsAdmin=false;window.forumAdminAccessConfirmed=false;forumComments=[];forumProfiles.clear();renderCommunityForumComments([]);forumStatus('');if(el('forumAdministrationBtn'))el('forumAdministrationBtn').classList.add('hide');clearAdminState();stopPresenceHeartbeat();}
  }
  function clearVisibleState(){applyTrackerState(createEmptyTrackerState());try{init(false,false);}catch(_e){}}
  function writeCache(){
    const trackerState=getTrackerState();
    if(!currentUserId||!validateTrackerState(trackerState))return false;
    try{localStorage.setItem(cacheKey(currentUserId),JSON.stringify({user_id:currentUserId,tracker_state:trackerState,base_updated_at:lastKnownUpdatedAt,dirty,cache_timestamp:new Date().toISOString()}));return true;}catch(_e){return false;}
  }
  function readCache(id){
    try{const value=JSON.parse(localStorage.getItem(cacheKey(id))||'null');if(!value||value.user_id!==id||!validateTrackerState(value.tracker_state))return null;return {...value,base_updated_at:value.base_updated_at??value.updated_at??null,dirty:value.dirty===true};}catch(_e){return null;}
  }
  function renderAppliedState(){init(false,false);render();}
  function applyCloudRecord(record){
    if(!record||record.schema_version!==TRACKER_SCHEMA_VERSION||!validateTrackerState(record.tracker_state)||!applyTrackerState(record.tracker_state))throw new Error('invalid-cloud-state');
    stateRevision++;lastKnownUpdatedAt=record.updated_at||null;dirty=false;cloudReady=true;writeCache();renderAppliedState();
  }
  function applyCachedState(cache,offline=false){
    if(!cache||!applyTrackerState(cache.tracker_state))throw new Error('invalid-cache-state');
    stateRevision++;lastKnownUpdatedAt=cache.base_updated_at||null;dirty=cache.dirty===true;cloudReady=true;writeCache();renderAppliedState();
    if(offline)cloudStatus('Offline — cached copy');
  }
  function showConflict(record,mode,message){
    conflictRecord=record||null;conflictMode=mode;el('conflictActions').classList.remove('hide');
    el('keepDeviceVersionBtn').textContent=mode==='cache-recovery'?'Save Cached Version to Cloud':'Keep This Device Version';
    cloudStatus('Conflict — choice required');safeMessage(message,'error');showScreen('accountScreen');
  }
  function hideConflict(){conflictRecord=null;conflictMode=null;el('conflictActions').classList.add('hide');}
  async function verifiedSession(){const result=await client.auth.getSession();if(result.error||!result.data.session)return null;return result.data.session;}
  function adminStatus(message='',type=''){const node=el('adminUsersStatus');if(!node)return;node.textContent=message;node.className='adminStatus'+(type?' '+type:'');}
  function clearAdminState(){adminAuthorized=false;window.adminAccessConfirmed=false;adminUsers=[];adminSummary=null;adminPagination={page:1,pages:1,total:0};if(el('adminMenuBtn'))el('adminMenuBtn').classList.add('hide');if(el('adminSummary'))el('adminSummary').replaceChildren();if(el('adminUsersBody'))el('adminUsersBody').replaceChildren();if(el('adminPageLabel'))el('adminPageLabel').textContent='';adminStatus('');}
  async function callAdminFunction(body){const active=await verifiedSession();if(!active||active.user.id!==currentUserId)throw Object.assign(new Error('Authentication required.'),{status:401});const response=await fetch(`${SUPABASE_URL}/functions/v1/admin-users`,{method:'POST',headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});let data={};try{data=await response.json();}catch(_e){}if(!response.ok)throw Object.assign(new Error(String(data.error||'Administrator request failed.')),{status:response.status});return data;}
  async function checkAdminAuthorization(){try{const data=await callAdminFunction({action:'status'});adminAuthorized=data.isAdmin===true;window.adminAccessConfirmed=adminAuthorized;el('adminMenuBtn').classList.toggle('hide',!adminAuthorized);return adminAuthorized;}catch(_error){clearAdminState();return false;}}
  function stopPresenceHeartbeat(){if(presenceTimer)clearInterval(presenceTimer);presenceTimer=null;presenceInFlight=false;}
  function currentActivityPage(){return typeof activeScreenId==='function'?(activeScreenId()||'tracker'):'tracker';}
  async function recordTrackerActivity(page=currentActivityPage(),sessionStarted=false){if(!client||!currentUserId||document.visibilityState==='hidden'||presenceInFlight)return false;presenceInFlight=true;try{const active=await verifiedSession();if(!active||active.user.id!==currentUserId)return false;const result=await client.rpc('record_user_activity',{p_page:String(page||'tracker').slice(0,100),p_session_started:sessionStarted});return !result.error;}catch(_error){return false;}finally{presenceInFlight=false;}}
  function startPresenceHeartbeat(){stopPresenceHeartbeat();recordTrackerActivity(currentActivityPage(),true);presenceTimer=setInterval(()=>{if(document.visibilityState!=='hidden')recordTrackerActivity(currentActivityPage(),false);},60000);}
  window.adminAccessConfirmed=false;window.recordTrackerActivity=(page)=>recordTrackerActivity(page,false);window.denyAdminAccess=()=>safeMessage('Administrator access is required.','error');
  const adminColumns=[['email','Email'],['createdAt','Registration date'],['lastSignInAt','Last sign-in'],['lastSeenAt','Last activity'],['status','Current status'],['activeDays','Active days'],['sessionCount','Sessions'],['trackedDays','Tracked days'],['lastTrackedDate','Last tracked date']];
  const formatAdminDate=value=>value?new Date(value).toLocaleString():'Not available';
  const adminStatusLabel=value=>({active_now:'Active now',recently_active:'Recently active',offline:'Offline',never_active:'Never active'}[value]||'Not available');
  function renderAdminDashboard(){const summaryNode=el('adminSummary'),head=el('adminUsersHead'),body=el('adminUsersBody');summaryNode.replaceChildren();for(const [key,label] of [['totalUsers','Total registered users'],['activeNow','Users active now'],['active24Hours','Active in last 24 hours'],['active7Days','Active in last 7 days'],['new30Days','New in last 30 days']]){const card=document.createElement('div'),value=document.createElement('b'),caption=document.createElement('span');card.className='pill';value.textContent=String(adminSummary?.[key]??0);caption.textContent=label;card.append(value,caption);summaryNode.appendChild(card);}head.replaceChildren();adminColumns.forEach(([key,label])=>{const th=document.createElement('th'),button=document.createElement('button');button.type='button';button.textContent=label+(adminSort===key?(adminDirection==='asc'?' ↑':' ↓'):'');button.addEventListener('click',()=>{adminDirection=adminSort===key&&adminDirection==='asc'?'desc':'asc';adminSort=key;loadAdminUsers(1);});th.appendChild(button);head.appendChild(th);});body.replaceChildren();if(!adminUsers.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=adminColumns.length;cell.textContent='No users match the current filters.';row.appendChild(cell);body.appendChild(row);}for(const user of adminUsers){const row=document.createElement('tr'),values=[user.email,formatAdminDate(user.createdAt),formatAdminDate(user.lastSignInAt),formatAdminDate(user.lastSeenAt),adminStatusLabel(user.status),user.activeDays,user.sessionCount,user.trackedDays,user.lastTrackedDate||'Not available'];for(const value of values){const cell=document.createElement('td');cell.textContent=String(value??'Not available');row.appendChild(cell);}body.appendChild(row);}el('adminPageLabel').textContent=`Page ${adminPagination.page} of ${adminPagination.pages} · ${adminPagination.total} result${adminPagination.total===1?'':'s'}`;el('adminPreviousPageBtn').disabled=adminPagination.page<=1;el('adminNextPageBtn').disabled=adminPagination.page>=adminPagination.pages;}
  async function loadAdminUsers(page=adminPagination.page){if(!adminAuthorized||window.adminAccessConfirmed!==true){clearAdminState();showScreen('mainMenuScreen');safeMessage('Administrator access is required.','error');return false;}adminStatus('Loading administrator data…');try{const data=await callAdminFunction({page,pageSize:25,search:el('adminUserSearch').value.trim(),status:el('adminStatusFilter').value,sort:adminSort,direction:adminDirection});if(data.isAdmin!==true)throw Object.assign(new Error('Administrator access is required.'),{status:403});adminSummary=data.summary||{};adminUsers=Array.isArray(data.users)?data.users:[];adminPagination=data.pagination||{page:1,pages:1,total:adminUsers.length};renderAdminDashboard();adminStatus('Application activity loaded.','success');return true;}catch(error){if(error.status===401||error.status===403){clearAdminState();showScreen('mainMenuScreen');safeMessage('Administrator authorization is no longer available.','error');return false;}adminStatus('Administrator data could not be loaded. Please retry.','error');return false;}}
  async function fetchCloudRecord(userId){
    const result=await client.from('tracker_states').select('tracker_state,schema_version,updated_at').eq('user_id',userId).maybeSingle();
    if(result.error)throw result.error;return result.data||null;
  }
  function reconcileCloudAndCache(cloud,cache){
    if(cache&&cache.dirty){
      if(cloud&&statesEqual(cache.tracker_state,cloud.tracker_state)){applyCloudRecord(cloud);safeMessage('Cached edits already match the cloud version.','success');cloudStatus('Saved');return 'identical';}
      const cacheTime=Date.parse(cache.cache_timestamp||'')||0;
      const cloudTime=Date.parse(cloud&&cloud.updated_at||'')||0;
      const versionNote=cloudTime>cacheTime?'The cloud record is newer, but cached edits are still preserved.':'The cached edits are newer than or pending against the last confirmed cloud version.';
      applyCachedState(cache);
      showConflict(cloud,'cache-recovery',`Unsaved cached edits were recovered. ${versionNote} Choose whether to save them to cloud or load the cloud version.`);
      return 'dirty-cache';
    }
    if(cloud){applyCloudRecord(cloud);safeMessage('Cloud Tracker loaded successfully.','success');cloudStatus('Saved');return cache?'cloud':'no-cache';}
    if(cache){applyCachedState(cache);lastKnownUpdatedAt=null;dirty=true;writeCache();return 'clean-cache-no-cloud';}
    return 'empty';
  }
  function loadAuthenticatedUserState(generation=sessionGeneration,expectedUserId=currentUserId){
    const key=`${generation}:${expectedUserId||''}`;
    if(loadInFlight&&loadInFlightKey===key)return loadInFlight;
    const pending=performAuthenticatedUserLoad(generation,expectedUserId);
    const wrapped=pending.finally(()=>{if(loadInFlight===wrapped){loadInFlight=null;loadInFlightKey=null;}});
    loadInFlight=wrapped;loadInFlightKey=key;return wrapped;
  }
  async function performAuthenticatedUserLoad(generation,expectedUserId){
    const active=await verifiedSession();
    if(generation!==sessionGeneration||expectedUserId!==currentUserId)return false;
    if(!active){cloudReady=false;cloudStatus('Authentication expired');return false;}
    const user=active.user;if(!user||user.id!==expectedUserId)return false;loading=true;cloudReady=false;cloudStatus('Loading cloud data…');
    const cache=readCache(user.id);
    try{
      const cloud=await fetchCloudRecord(user.id);
      if(generation!==sessionGeneration||user.id!==currentUserId)return false;
      if(cloud)completedDeletionUsers.delete(user.id);
      if(!cloud&&completedDeletionUsers.has(user.id)){
        try{localStorage.removeItem(cacheKey(user.id));}catch(_e){}
        applyTrackerState(createEmptyTrackerState());stateRevision++;lastKnownUpdatedAt=null;dirty=false;cloudReady=true;renderAppliedState();
        lastLoadedUserId=user.id;safeMessage('Account Tracker data remains deleted. Make a change or choose Save Now to create new cloud data.','success');cloudStatus('No cloud record');return true;
      }
      if(cloud&&(cloud.schema_version!==TRACKER_SCHEMA_VERSION||!validateTrackerState(cloud.tracker_state))){cloudStatus('Error');safeMessage('Cloud data uses an invalid or unsupported Tracker format. It was not applied.','error');return false;}
      const outcome=reconcileCloudAndCache(cloud,cache);
      if(outcome==='empty'){
        applyTrackerState(createEmptyTrackerState());lastKnownUpdatedAt=null;cloudReady=true;dirty=true;writeCache();
        if(!await saveAuthenticatedUserState())throw new Error('initial-save-failed');renderAppliedState();safeMessage('A clean Tracker was created for this account.','success');
      }else if(outcome==='clean-cache-no-cloud'){
        const restored=await saveAuthenticatedUserState({expectedUpdatedAt:null});
        if(generation!==sessionGeneration||user.id!==currentUserId)return false;
        if(restored)safeMessage('Cached Tracker state was restored to cloud successfully.','success');
        else if(navigator.onLine===false)cloudStatus('Offline — cached copy pending cloud restore');
      }
      lastLoadedUserId=user.id;return true;
    }catch(error){
      if(generation!==sessionGeneration||user.id!==currentUserId)return false;
      const fallback=readCache(user.id)||cache;
      if(fallback){applyCachedState(fallback,true);safeMessage(fallback.dirty?'Cloud loading failed. Unsaved cached edits are preserved for retry.':'Cloud loading failed. Showing this account’s cached offline copy.','error');return true;}
      cloudStatus('Error');safeMessage(error.message==='invalid-cloud-state'?'Invalid cloud state was rejected.':friendlyError(error),'error');return false;
    }finally{if(generation===sessionGeneration)loading=false;}
  }
  function rpcResult(data){return Array.isArray(data)?data[0]:data;}
  function saveAuthenticatedUserState(options={}){
    clearTimeout(saveTimer);saveTimer=null;if(!cloudReady||deletionInProgress)return Promise.resolve(false);
    if(saveInFlight){followUpSaveRequested=true;queuedSaveOptions=options;return saveInFlight;}
    const generation=persistenceGeneration;
    queuedSaveOptions=options;
    const pending=(async()=>{
      let saved=false;
      do{
        const nextOptions=queuedSaveOptions||{};queuedSaveOptions=null;followUpSaveRequested=false;
        saved=await performAuthenticatedSave(nextOptions,generation);
        if(!saved||generation!==persistenceGeneration||deletionInProgress)break;
      }while(followUpSaveRequested||dirty);
      return saved&&!dirty;
    })();
    const wrapped=pending.finally(()=>{if(saveInFlight===wrapped)saveInFlight=null;});
    saveInFlight=wrapped;
    return wrapped;
  }
  async function performAuthenticatedSave(options,generation){
    const trackerState=options.trackerState||getTrackerState();
    const savedRevision=stateRevision;
    if(!validateTrackerState(trackerState)){cloudStatus('Error');safeMessage('Tracker state validation failed. Nothing was sent.','error');return false;}
    const active=await verifiedSession();
    if(generation!==persistenceGeneration||deletionInProgress)return false;
    if(!active||!active.user){cloudStatus('Authentication expired');writeCache();safeMessage('Your session expired. Unsaved changes remain cached.','error');return false;}
    if(active.user.id!==currentUserId)return false;
    const expected=Object.prototype.hasOwnProperty.call(options,'expectedUpdatedAt')?options.expectedUpdatedAt:lastKnownUpdatedAt;
    cloudStatus('Saving…');
    try{
      const result=await client.rpc(SAVE_RPC,{p_tracker_state:trackerState,p_schema_version:TRACKER_SCHEMA_VERSION,p_expected_updated_at:expected});
      if(generation!==persistenceGeneration||deletionInProgress)return false;
      if(result.error)throw result.error;const outcome=rpcResult(result.data);
      if(!outcome||outcome.success!==true){
        dirty=true;writeCache();let latest=null;try{latest=await fetchCloudRecord(active.user.id);}catch(_e){}
        if(generation!==persistenceGeneration||deletionInProgress)return false;
        if(!latest){cloudStatus(navigator.onLine===false?'Offline':'Error');safeMessage('Cloud state changed, but the latest version could not be loaded. Your cached edits are preserved for retry.','error');return false;}
        showConflict(latest,latest?'save-conflict':(options.cacheRecovery?'cache-recovery':'save-conflict'),'A newer cloud version prevented this save. No cloud data was overwritten.');return false;
      }
      lastKnownUpdatedAt=outcome.new_updated_at;dirty=stateRevision!==savedRevision;hideConflict();writeCache();
      completedDeletionUsers.delete(active.user.id);
      if(dirty){clearTimeout(saveTimer);saveTimer=null;followUpSaveRequested=true;cloudStatus('Waiting to save');safeMessage('Newer edits are queued for cloud saving.');}
      else{cloudStatus('Saved');safeMessage('Tracker saved to your private cloud record.','success');}
      if(el('lastCloudSave'))el('lastCloudSave').textContent=new Date(lastKnownUpdatedAt).toLocaleString();return true;
    }catch(error){if(generation!==persistenceGeneration||deletionInProgress)return false;dirty=true;writeCache();cloudStatus(navigator.onLine===false?'Offline':'Error');safeMessage(friendlyError(error),'error');return false;}
  }
  function stateChanged(){
    if(deletionInProgress)return false;
    if(!session||!currentUserId||!cloudReady){setStorageStatus(session?'Waiting for cloud load to finish.':'Sign in to save Tracker data.',true);return false;}
    stateRevision++;dirty=true;writeCache();cloudStatus(navigator.onLine===false?'Offline':'Waiting to save');clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveAuthenticatedUserState(),SAVE_DEBOUNCE_MS);return true;
  }
  window.trackerAccountStateChanged=stateChanged;window.loadAuthenticatedUserState=loadAuthenticatedUserState;window.saveAuthenticatedUserState=saveAuthenticatedUserState;

  async function handleSession(nextSession,event){
    if(logoutInProgress&&nextSession&&event!=='SIGNED_OUT')return;
    const nextId=nextSession&&nextSession.user&&nextSession.user.id||null,previousId=currentUserId;session=nextSession;
    const changed=nextId!==previousId;
    if(changed){
      sessionGeneration++;persistenceGeneration++;deletionOperationGeneration++;activeDeletion=null;deletionInProgress=false;loadInFlight=null;loadInFlightKey=null;recoveryContext=null;clearTimeout(saveTimer);saveTimer=null;saveInFlight=null;followUpSaveRequested=false;queuedSaveOptions=null;
      currentUserId=nextId;lastLoadedUserId=null;lastKnownUpdatedAt=null;cloudReady=false;loading=false;dirty=false;stateRevision=0;conflictRecord=null;conflictMode=null;logoutPending=false;recovery=false;
      clearVisibleState();hideConflict();el('logoutProtectionActions').classList.add('hide');if(el('lastCloudSave'))el('lastCloudSave').textContent='';safeMessage(nextId?'Loading this account’s Tracker…':'');cloudStatus(nextId?'Loading cloud data…':'Not signed in');setAuthView(nextSession&&nextSession.user||null);
      document.body.classList.toggle('trackerLocked',true);
    }
    if(!nextId){setAuthView(null);if(event==='SIGNED_OUT'){accountRequested=false;showScreen('publicLandingScreen');}return;}
    if(!changed){currentUserId=nextId;setAuthView(nextSession.user);}
    if(event==='PASSWORD_RECOVERY'){recovery=true;recoveryContext={userId:nextId,sessionGeneration};cloudReady=false;setAuthView(nextSession.user);document.body.classList.toggle('trackerLocked',true);safeMessage('Enter and confirm your new password.');return;}
    if(recovery){document.body.classList.toggle('trackerLocked',true);return;}
    if(changed||lastLoadedUserId!==nextId){const generation=sessionGeneration;const loaded=await loadAuthenticatedUserState(generation,nextId);if(loaded&&generation===sessionGeneration&&nextId===currentUserId){setAuthView(nextSession.user);startPresenceHeartbeat();checkAdminAuthorization();if(conflictRecord)showScreen('accountScreen');else if(event==='INITIAL_SESSION')showScreen(accountRequested?'accountScreen':'publicLandingScreen');else{accountRequested=false;showScreen('mainMenuScreen');}}}
  }
  async function register(){const email=el('accountEmail').value.trim(),password=el('accountPassword').value;if(!validEmail(email)){safeMessage('Enter a valid email address.','error');return;}if(password.length<8){safeMessage('Password must be at least 8 characters.','error');return;}safeMessage('Creating account…');const result=await client.auth.signUp({email,password,options:{emailRedirectTo:AUTH_REDIRECT_URL}});if(result.error){safeMessage(friendlyError(result.error),'error');return;}if(result.data.session)safeMessage('Account created and signed in. Loading your Tracker…','success');else{safeMessage('Account created. Check your email to confirm it before logging in.','success');el('resendConfirmationBtn').classList.remove('hide');}}
  async function login(){const email=el('accountEmail').value.trim(),password=el('accountPassword').value;if(!validEmail(email)||!password){safeMessage('Enter a valid email and password.','error');return;}safeMessage('Logging in…');el('loginBtn').disabled=true;const result=await client.auth.signInWithPassword({email,password});el('loginBtn').disabled=false;if(result.error)safeMessage(friendlyError(result.error),'error');}
  async function submitContact(event){
    event.preventDefault();
    const name=el('contactName').value.trim(),sender_email=el('contactEmail').value.trim(),subject=el('contactSubject').value.trim(),message=el('contactMessage').value.trim();
    const status=el('contactStatus'),button=el('sendContactBtn');
    const report=(text,type='')=>{status.textContent=text;status.className='contactStatus'+(type?' '+type:'');};
    if(button.disabled)return;
    if(!name||!sender_email||!subject||!message){report('Complete all required fields.','error');return;}
    if(!validEmail(sender_email)){report('Enter a valid email address.','error');return;}
    if(name.length>100||sender_email.length>254||subject.length>200||message.length>5000){report('One or more fields exceed the allowed length.','error');return;}
    button.disabled=true;report('Sending message…');
    try{
      const active=await verifiedSession();
      if(!active||!active.access_token){await handleSession(null,'SIGNED_OUT');safeMessage('Your session expired. Please log in again.','error');return;}
      const result=await client.functions.invoke('contact-admin',{headers:{Authorization:`Bearer ${active.access_token}`},body:{name,sender_email,subject,message}});
      const details=await contactResultDetails(result),data=details.data;
      if(data&&data.ok===true&&data.stored===true&&data.delivered===true){el('contactSubject').value='';el('contactMessage').value='';report('Message sent successfully.','success');return;}
      if(data&&data.stored===true&&data.delivered===false){console.warn('Contact Admin delivery failed after storage',{status:details.status,error:details.error});report('Message saved, but email delivery failed. Please contact the administrator another way if the matter is urgent.','error');return;}
      console.error('Contact Admin submission failed',{status:details.status,error:details.error});
      report('Your message could not be sent. Please try again.','error');
    }
    catch(error){console.error('Contact Admin submission failed',{status:null,error:sanitizedContactError(error&&error.message)});report('Your message could not be sent. Please try again.','error');}
    finally{button.disabled=false;}
  }
  const forumStatus=(message,type='',target='communityForumStatus')=>{const node=el(target);if(!node)return;node.textContent=message;node.className='forumStatus'+(type?' '+type:'');};
  function forumErrorMessage(error){
    console.error('Community Forum operation failed',error);
    const code=String(error&&error.code||''),message=String(error&&error.message||'').toLowerCase();
    if(code==='42P01'||code==='PGRST202'||code==='PGRST205'||message.includes('schema cache')||message.includes('does not exist'))return 'The Forum database has not been installed. Run community_forum_v2.sql in Supabase.';
    if(code==='23505'||message.includes('duplicate key'))return 'That screen name is already taken.';
    if(code==='42501'||code==='PGRST301'||message.includes('row-level security')||message.includes('permission denied'))return 'Forum permission was denied by the database security policy.';
    if(message.includes('fetch')||message.includes('network')||message.includes('failed to fetch'))return 'The Forum could not reach Supabase. Check your network connection and try again.';
    return 'The Community Forum could not complete that request. Please try again.';
  }
  const reservedForumNames=new Set(['admin','administrator','moderator','nutrition tracker','system']);
  function validateForumScreenName(value){const name=String(value||'').trim();if(!name)return {error:'Screen name is required.'};if(name.length<3||name.length>30)return {error:'Screen name must be between 3 and 30 characters.'};if(!/^[A-Za-z0-9 _-]+$/.test(name))return {error:'Screen name may use only letters, numbers, spaces, underscores, and hyphens.'};if(name.includes('@')||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name))return {error:'Screen name must not be an email address.'};if(reservedForumNames.has(name.toLowerCase()))return {error:'That screen name is reserved.'};return {name};}
  function setForumProfileView(){const has=!!(forumProfile&&forumProfile.screen_name);el('forumScreenNameForm').classList.toggle('hide',has);el('forumPostingIdentity').classList.toggle('hide',!has);el('postCommunityForumCommentBtn').disabled=!has;if(has){el('forumPostingAs').textContent='Posting as: '+forumProfile.screen_name;el('forumScreenName').value=forumProfile.screen_name;}el('forumAdministrationBtn').classList.toggle('hide',!forumIsAdmin);}
  async function requireForumSession(message='Log in to use the Community Forum.') {const active=await verifiedSession();if(active&&active.user)return active;forumStatus(message,'error');await handleSession(null,'SIGNED_OUT');return null;}
  async function loadForumProfile(active){const result=await client.from('forum_profiles').select('user_id,screen_name,created_at,updated_at').eq('user_id',active.user.id).maybeSingle();if(result.error)throw result.error;forumProfile=result.data||null;setForumProfileView();return forumProfile;}
  async function loadForumAdminStatus(){const result=await client.rpc('is_forum_admin');if(result.error)throw result.error;forumIsAdmin=result.data===true;window.forumAdminAccessConfirmed=forumIsAdmin;setForumProfileView();return forumIsAdmin;}
  async function saveForumScreenName(event){if(event)event.preventDefault();const active=await requireForumSession();if(!active)return false;const checked=validateForumScreenName(el('forumScreenName').value);if(checked.error){forumStatus(checked.error,'error');return false;}const button=el('saveForumScreenNameBtn');button.disabled=true;try{const query=forumProfile?client.from('forum_profiles').update({screen_name:checked.name}).eq('user_id',active.user.id):client.from('forum_profiles').insert({user_id:active.user.id,screen_name:checked.name});const result=await query.select('user_id,screen_name,created_at,updated_at').single();if(result.error){forumStatus(forumErrorMessage(result.error),'error');return false;}forumProfile=result.data;setForumProfileView();await loadCommunityForumComments();forumStatus('Screen name saved. Posting as: '+forumProfile.screen_name,'success');return true;}catch(error){forumStatus(forumErrorMessage(error),'error');return false;}finally{button.disabled=false;}}
  function beginForumScreenNameChange(){el('forumScreenNameForm').classList.remove('hide');el('forumPostingIdentity').classList.add('hide');el('cancelForumScreenNameBtn').classList.toggle('hide',!forumProfile);el('postCommunityForumCommentBtn').disabled=true;el('forumScreenName').focus();}
  function cancelForumScreenNameChange(){setForumProfileView();el('cancelForumScreenNameBtn').classList.add('hide');}
  function forumName(userId){return forumProfiles.get(userId)||'Former forum user';}
  function forumButton(label,handler,extraClass='secondary'){const button=document.createElement('button');button.type='button';button.className=extraClass;button.textContent=label;button.addEventListener('click',handler);return button;}
  function updateCounter(textarea,counter){counter.textContent=(2000-textarea.value.length)+' characters remaining';}
  function openReplyForm(comment){document.querySelectorAll('.forumReplyForm').forEach(node=>node.remove());if(!forumProfile){beginForumScreenNameChange();forumStatus('Screen name is required before replying.','error');return;}const topId=comment.parent_comment_id||comment.id,form=document.createElement('form'),textarea=document.createElement('textarea'),counter=document.createElement('div'),actions=document.createElement('div'),post=forumButton('Post Reply',()=>{}),cancel=forumButton('Cancel',()=>form.remove());form.className='forumReplyForm';textarea.maxLength=2000;textarea.required=true;counter.className='small';actions.className='actions';post.className='';updateCounter(textarea,counter);textarea.addEventListener('input',()=>updateCounter(textarea,counter));form.addEventListener('submit',event=>postForumText(event,textarea,post,topId,comment.user_id,form));post.addEventListener('click',event=>{event.preventDefault();form.requestSubmit();});actions.append(post,cancel);form.append(textarea,counter,actions);document.getElementById('forum-comment-'+topId).appendChild(form);textarea.focus();}
  function renderForumComment(comment,isReply=false){const article=document.createElement('article'),meta=document.createElement('div'),text=document.createElement('div'),actions=document.createElement('div');article.id='forum-comment-'+comment.id;article.className='forumComment'+(isReply?' forumReply':'');meta.className='forumCommentMeta';text.className='forumCommentText';actions.className='actions';let label=forumName(comment.user_id);if(isReply&&comment.reply_to_user_id)label+=' · Replying to '+forumName(comment.reply_to_user_id);meta.textContent=label+' · '+new Date(comment.created_at).toLocaleString();text.textContent=String(comment.comment_text||'');actions.appendChild(forumButton('Reply',()=>openReplyForm(comment)));if(comment.user_id===currentUserId||forumIsAdmin)actions.appendChild(forumButton('Delete',()=>deleteForumComment(comment), 'danger'));article.append(meta,text,actions);return article;}
  function renderCommunityForumComments(comments=forumComments){const list=el('communityForumComments');if(!list)return;list.replaceChildren();const top=comments.filter(comment=>!comment.parent_comment_id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));if(!top.length){const empty=document.createElement('p');empty.textContent='No comments yet. Be the first to post.';list.appendChild(empty);return;}top.forEach(comment=>{const article=renderForumComment(comment);list.appendChild(article);comments.filter(reply=>reply.parent_comment_id===comment.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).forEach(reply=>article.appendChild(renderForumComment(reply,true)));});}
  async function loadCommunityForumComments(){const active=await requireForumSession('Log in to view Community Forum comments.');if(!active){forumComments=[];forumProfiles.clear();renderCommunityForumComments();return false;}forumStatus('Loading Forum…');try{await loadForumProfile(active);await loadForumAdminStatus();const result=await client.from('community_forum_comments').select('id,user_id,parent_comment_id,reply_to_user_id,comment_text,created_at').order('created_at',{ascending:false}).limit(200);if(result.error)throw result.error;forumComments=result.data||[];const ids=[...new Set(forumComments.flatMap(comment=>[comment.user_id,comment.reply_to_user_id]).filter(Boolean))];forumProfiles=new Map();if(ids.length){const profiles=await client.from('forum_profiles').select('user_id,screen_name').in('user_id',ids);if(profiles.error)throw profiles.error;(profiles.data||[]).forEach(profile=>forumProfiles.set(profile.user_id,profile.screen_name));}renderCommunityForumComments();if(!forumProfile){beginForumScreenNameChange();forumStatus('Choose a screen name before posting or replying.','error');}else forumStatus('Comments refreshed.','success');return true;}catch(error){forumStatus(forumErrorMessage(error),'error');return false;}}
  async function postForumText(event,textarea,button,parentCommentId=null,replyToUserId=null,replyForm=null){if(event)event.preventDefault();if(forumPosting)return false;const comment=textarea.value.trim();if(!comment){forumStatus(parentCommentId?'Enter a reply before posting.':'Enter a comment before posting.','error');return false;}if(comment.length>2000){forumStatus('Comments cannot exceed 2,000 characters.','error');return false;}const active=await requireForumSession();if(!active)return false;if(!forumProfile){beginForumScreenNameChange();forumStatus('Screen name is required before posting or replying.','error');return false;}forumPosting=true;button.disabled=true;try{const result=await client.from('community_forum_comments').insert({user_id:active.user.id,parent_comment_id:parentCommentId,reply_to_user_id:replyToUserId,comment_text:comment}).select('id,user_id,parent_comment_id,reply_to_user_id,comment_text,created_at').single();if(result.error){forumStatus(forumErrorMessage(result.error),'error');return false;}textarea.value='';if(parentCommentId){if(replyForm)replyForm.remove();}else updateCommunityForumCharacterCount();await loadCommunityForumComments();forumStatus(parentCommentId?'Reply posted successfully.':'Comment posted successfully.','success');return true;}catch(error){forumStatus(forumErrorMessage(error),'error');return false;}finally{forumPosting=false;button.disabled=!forumProfile;}}
  function postCommunityForumComment(event){return postForumText(event,el('communityForumComment'),el('postCommunityForumCommentBtn'));}
  async function deleteForumComment(comment,refreshAdministration=false){const isReply=!!comment.parent_comment_id,message=isReply?'Delete this reply?':'Delete this comment and any replies to it?';if(!confirm(message))return false;const active=await requireForumSession();if(!active)return false;const result=await client.from('community_forum_comments').delete().eq('id',comment.id);if(result.error){forumStatus(forumErrorMessage(result.error),'error');return false;}if(refreshAdministration)await loadForumAdministration();else await loadCommunityForumComments();forumStatus(isReply?'Reply deleted.':'Comment and its replies deleted.','success',refreshAdministration?'forumAdminStatus':'communityForumStatus');return true;}
  function updateCommunityForumCharacterCount(){updateCounter(el('communityForumComment'),el('communityForumCharacterCount'));}
  function renderForumAdministration(){const userSearch=el('forumAdminUserSearch').value.trim().toLowerCase(),commentSearch=el('forumAdminCommentSearch').value.trim().toLowerCase(),users=el('forumAdminUsers'),comments=el('forumAdminComments');users.replaceChildren();comments.replaceChildren();forumAdminUsers.filter(profile=>!userSearch||profile.screen_name.toLowerCase().includes(userSearch)||profile.user_id.toLowerCase().includes(userSearch)).forEach(profile=>{const item=document.createElement('div');item.className='forumAdminItem';item.textContent=profile.screen_name+' · '+profile.user_id+' · Created '+new Date(profile.created_at).toLocaleString()+' · Updated '+new Date(profile.updated_at).toLocaleString();users.appendChild(item);});forumAdminComments.filter(comment=>!commentSearch||comment.id.toLowerCase().includes(commentSearch)||comment.user_id.toLowerCase().includes(commentSearch)||String(comment.comment_text).toLowerCase().includes(commentSearch)).forEach(comment=>{const item=document.createElement('div'),text=document.createElement('div');item.className='forumAdminItem';text.textContent=String(comment.comment_text||'');item.appendChild(document.createTextNode('Comment '+comment.id+' · '+forumName(comment.user_id)+' · Author '+comment.user_id+' · Parent '+(comment.parent_comment_id||'none')+' · Reply-to '+(comment.reply_to_user_id||'none')+' · '+new Date(comment.created_at).toLocaleString()),text,forumButton('Delete',()=>deleteForumComment(comment,true),'danger'));comments.appendChild(item);});}
  async function loadForumAdministration(){const active=await requireForumSession();if(!active)return false;try{await loadForumAdminStatus();if(!forumIsAdmin){showScreen('communityForumScreen');forumStatus('Administrator access is required.','error');return false;}showScreen('forumAdministrationScreen');forumStatus('Loading administration data…','', 'forumAdminStatus');const profiles=await client.from('forum_profiles').select('user_id,screen_name,created_at,updated_at').order('screen_name',{ascending:true}),comments=await client.from('community_forum_comments').select('id,user_id,parent_comment_id,reply_to_user_id,comment_text,created_at').order('created_at',{ascending:false}).limit(500);if(profiles.error)throw profiles.error;if(comments.error)throw comments.error;forumAdminUsers=profiles.data||[];forumAdminComments=comments.data||[];forumProfiles=new Map(forumAdminUsers.map(profile=>[profile.user_id,profile.screen_name]));renderForumAdministration();forumStatus('Administration data refreshed.','success','forumAdminStatus');return true;}catch(error){forumStatus(forumErrorMessage(error),'error','forumAdminStatus');return false;}}
  window.forumAdminAccessConfirmed=false;window.denyForumAdministrationAccess=()=>forumStatus('Administrator access is required.','error');window.loadCommunityForumComments=loadCommunityForumComments;window.postCommunityForumComment=postCommunityForumComment;window.renderCommunityForumComments=renderCommunityForumComments;window.loadForumAdministration=loadForumAdministration;
  async function completeLogout(discard=false){
    logoutInProgress=true;await recordTrackerActivity(currentActivityPage(),false);stopPresenceHeartbeat();clearAdminState();const result=await client.auth.signOut();if(result.error){logoutInProgress=false;if(currentUserId){startPresenceHeartbeat();checkAdminAuthorization();}safeMessage(friendlyError(result.error),'error');return false;}
    const confirmed=await client.auth.getSession();if(confirmed.error||confirmed.data.session){logoutInProgress=false;if(currentUserId){startPresenceHeartbeat();checkAdminAuthorization();}safeMessage('Sign-out could not be confirmed. Please try again.','error');return false;}
    accountRequested=false;await handleSession(null,'SIGNED_OUT');logoutInProgress=false;logoutPending=false;el('logoutProtectionActions').classList.add('hide');safeMessage(discard?'Unsaved changes were discarded and you were logged out.':'Logged out successfully.','success');showScreen('publicLandingScreen');return true;
  }
  async function logout(){
    if(dirty){const saved=await saveAuthenticatedUserState();if(!saved){logoutPending=true;el('logoutProtectionActions').classList.remove('hide');safeMessage('Logout was stopped to protect unsaved changes. Retry saving, stay signed in, or explicitly discard the changes.','error');showScreen('accountScreen');return false;}}
    return completeLogout(false);
  }
  async function retryLogoutSave(){if(!logoutPending)return;const saved=await saveAuthenticatedUserState();if(saved)await completeLogout(false);else safeMessage('Save still failed. Logout remains stopped and your account cache is preserved.','error');}
  function staySignedIn(){logoutPending=false;el('logoutProtectionActions').classList.add('hide');safeMessage('You are still signed in. Unsaved changes remain available for retry.');}
  async function discardAndLogout(){if(!logoutPending)return;if(!confirm('Discard all unsaved changes on this device and log out? This cannot be undone.'))return;if(prompt('Type DISCARD AND LOG OUT to confirm:')!=='DISCARD AND LOG OUT')return;await completeLogout(true);}
  async function forgot(){const email=el('accountEmail').value.trim();if(!validEmail(email)){safeMessage('Enter a valid email address.','error');return;}const result=await client.auth.resetPasswordForEmail(email,{redirectTo:AUTH_REDIRECT_URL});safeMessage(result.error?friendlyError(result.error):'If the address can receive a reset email, the request has been sent.',result.error?'error':'success');}
  async function finishRecoveryLoad(context){
    if(!context||context!==recoveryContext||context.userId!==currentUserId||context.sessionGeneration!==sessionGeneration)return false;
    cloudReady=false;document.body.classList.toggle('trackerLocked',true);el('retryRecoveryLoadBtn').classList.add('hide');safeMessage('Password changed successfully. Loading your Tracker…','success');
    const loaded=await loadAuthenticatedUserState(context.sessionGeneration,context.userId);
    if(context!==recoveryContext||context.userId!==currentUserId||context.sessionGeneration!==sessionGeneration)return false;
    if(!loaded){cloudReady=false;document.body.classList.toggle('trackerLocked',true);el('retryRecoveryLoadBtn').classList.remove('hide');safeMessage('Password changed successfully, but Tracker data could not be loaded. Choose Retry Load.','error');return false;}
    recovery=false;recoveryContext=null;el('retryRecoveryLoadBtn').classList.add('hide');setAuthView(session&&session.user);safeMessage('Password successfully changed and Tracker data loaded.','success');return true;
  }
  async function updatePassword(){
    const password=el('newPassword').value,confirmPassword=el('confirmNewPassword').value,context=recoveryContext;
    if(password.length<8){safeMessage('New password must be at least 8 characters.','error');return;}if(password!==confirmPassword){safeMessage('New passwords do not match.','error');return;}
    const result=await client.auth.updateUser({password});if(result.error){safeMessage(friendlyError(result.error),'error');return;}
    const active=await verifiedSession();if(!context||context!==recoveryContext||currentUserId!==context.userId||sessionGeneration!==context.sessionGeneration)return;
    if(!active||!active.user||active.user.id!==context.userId){cloudReady=false;document.body.classList.toggle('trackerLocked',true);el('retryRecoveryLoadBtn').classList.remove('hide');safeMessage('Password changed successfully, but the recovery session could not be confirmed. Choose Retry Load.','error');return;}
    await finishRecoveryLoad(context);
  }
  async function retryRecoveryLoad(){if(recoveryContext)await finishRecoveryLoad(recoveryContext);}
  async function deleteData(){
    if(!confirm('Delete all Tracker data stored for this account? This cannot be undone. Type confirmation is required next.'))return;
    if(prompt('Type DELETE ACCOUNT DATA to confirm:')!=='DELETE ACCOUNT DATA')return;
    const active=await verifiedSession();if(!active||active.user.id!==currentUserId)return;
    const deletionContext={userId:active.user.id,sessionGeneration,operationGeneration:++deletionOperationGeneration};activeDeletion=deletionContext;
    const deletionIsCurrent=()=>activeDeletion===deletionContext&&deletionContext.operationGeneration===deletionOperationGeneration&&deletionContext.sessionGeneration===sessionGeneration&&deletionContext.userId===currentUserId;
    clearTimeout(saveTimer);saveTimer=null;followUpSaveRequested=false;queuedSaveOptions=null;deletionInProgress=true;persistenceGeneration++;
    const pending=saveInFlight;
    if(pending)try{await pending;}catch(_e){}
    if(!deletionIsCurrent())return;
    let result;
    try{result=await client.from('tracker_states').delete().eq('user_id',deletionContext.userId);}
    catch(error){result={error};}
    if(!deletionIsCurrent()){if(!result.error)completedDeletionUsers.add(deletionContext.userId);return;}
    if(result.error){
      activeDeletion=null;deletionInProgress=false;
      if(dirty)saveTimer=setTimeout(()=>saveAuthenticatedUserState(),SAVE_DEBOUNCE_MS);
      safeMessage(friendlyError(result.error),'error');return;
    }
    completedDeletionUsers.add(deletionContext.userId);try{localStorage.removeItem(cacheKey(deletionContext.userId));}catch(_e){}
    applyTrackerState(createEmptyTrackerState());lastKnownUpdatedAt=null;cloudReady=true;dirty=false;hideConflict();renderAppliedState();
    activeDeletion=null;deletionInProgress=false;safeMessage('Account Tracker data deleted. It will remain deleted until you make a change or choose Save Now.','success');cloudStatus('No cloud record');
  }
  async function resend(){const email=el('accountEmail').value.trim();if(!validEmail(email)){safeMessage('Enter a valid email address.','error');return;}const result=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:AUTH_REDIRECT_URL}});safeMessage(result.error?friendlyError(result.error):'Confirmation email requested. Check your inbox.',result.error?'error':'success');}
  function loadConflictCloud(){
    if(dirty&&!confirm('Discard unsaved cached/device changes and load the cloud version?'))return;
    if(conflictRecord)applyCloudRecord(conflictRecord);
    else if(conflictMode==='cache-recovery'){applyTrackerState(createEmptyTrackerState());lastKnownUpdatedAt=null;dirty=false;cloudReady=true;writeCache();renderAppliedState();}
    else return;
    hideConflict();safeMessage('Cloud version loaded.','success');
  }
  async function saveConflictDevice(){
    if(conflictMode==='cache-recovery'){
      if(!confirm('Overwrite the currently displayed cloud version with the recovered cached Tracker state? A newer simultaneous cloud save will still be protected.'))return;
      const cachedState=getTrackerState();
      const expected=conflictRecord&&conflictRecord.updated_at?conflictRecord.updated_at:null;
      const saved=await saveAuthenticatedUserState({trackerState:cachedState,expectedUpdatedAt:expected,cacheRecovery:true});
      if(saved)safeMessage('Cached Tracker version saved to cloud successfully.','success');
      return;
    }
    if(!conflictRecord||!confirm('Overwrite the displayed cloud version with this device’s Tracker state? A newer simultaneous save will still be protected.'))return;
    const expected=conflictRecord.updated_at;hideConflict();await saveAuthenticatedUserState({expectedUpdatedAt:expected});
  }
  function bind(){
    [['createAccountBtn',register],['loginBtn',login],['logoutBtn',logout],['forgotPasswordBtn',forgot],['updatePasswordBtn',updatePassword],['retryRecoveryLoadBtn',retryRecoveryLoad],['deleteAccountDataBtn',deleteData],['resendConfirmationBtn',resend],['saveNowBtn',()=>saveAuthenticatedUserState()],['loadCloudVersionBtn',loadConflictCloud],['keepDeviceVersionBtn',saveConflictDevice],['retryLogoutSaveBtn',retryLogoutSave],['staySignedInBtn',staySignedIn],['discardAndLogoutBtn',discardAndLogout]].forEach(([id,fn])=>el(id).addEventListener('click',fn));
    el('contactForm').addEventListener('submit',submitContact);
    document.querySelectorAll('[data-screen="accountScreen"]').forEach(button=>button.addEventListener('click',()=>{accountRequested=true;}));
    el('communityForumForm').addEventListener('submit',postCommunityForumComment);el('communityForumComment').addEventListener('input',updateCommunityForumCharacterCount);el('refreshCommunityForumCommentsBtn').addEventListener('click',loadCommunityForumComments);document.querySelectorAll('[data-screen="communityForumScreen"]').forEach(button=>button.addEventListener('click',loadCommunityForumComments));el('forumScreenNameForm').addEventListener('submit',saveForumScreenName);el('changeForumScreenNameBtn').addEventListener('click',beginForumScreenNameChange);el('cancelForumScreenNameBtn').addEventListener('click',cancelForumScreenNameChange);el('forumAdministrationBtn').addEventListener('click',loadForumAdministration);el('refreshForumAdministrationBtn').addEventListener('click',loadForumAdministration);el('forumAdminUserSearch').addEventListener('input',renderForumAdministration);el('forumAdminCommentSearch').addEventListener('input',renderForumAdministration);
    el('adminMenuBtn').addEventListener('click',()=>loadAdminUsers(1));el('refreshAdminUsersBtn').addEventListener('click',()=>loadAdminUsers(adminPagination.page));el('adminStatusFilter').addEventListener('change',()=>loadAdminUsers(1));el('adminUserSearch').addEventListener('input',()=>{clearTimeout(adminSearchTimer);adminSearchTimer=setTimeout(()=>loadAdminUsers(1),300);});el('adminPreviousPageBtn').addEventListener('click',()=>loadAdminUsers(Math.max(1,adminPagination.page-1)));el('adminNextPageBtn').addEventListener('click',()=>loadAdminUsers(Math.min(adminPagination.pages,adminPagination.page+1)));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&cloudReady)saveAuthenticatedUserState();if(document.visibilityState==='visible'&&currentUserId)recordTrackerActivity(currentActivityPage(),false);});window.addEventListener('pagehide',()=>{if(dirty&&cloudReady)saveAuthenticatedUserState();});window.addEventListener('online',()=>{if(dirty&&cloudReady&&!deletionInProgress)saveAuthenticatedUserState();});
  }
  async function start(){clearVisibleState();setAuthView(null);showScreen('publicLandingScreen');if(!window.supabase||!window.supabase.createClient){cloudStatus('Offline');safeMessage('Account service could not load. Check your network connection.','error');return;}client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});bind();client.auth.onAuthStateChange((event,nextSession)=>{setTimeout(()=>handleSession(nextSession,event),0)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
