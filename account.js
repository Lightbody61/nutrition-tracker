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
  let conflictRecord=null,conflictMode=null,lastLoadedUserId=null,logoutPending=false;
  let deletionInProgress=false,persistenceGeneration=0,saveInFlight=null;
  let stateRevision=0,followUpSaveRequested=false,queuedSaveOptions=null,sessionGeneration=0;
  let deletionOperationGeneration=0,activeDeletion=null;
  const completedDeletionUsers=new Set();
  let loadInFlight=null,loadInFlightKey=null,recoveryContext=null;

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
    if(!user)showScreen('accountScreen');
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
    cloudStatus('Conflict — choice required');safeMessage(message,'error');showScreen('profileScreen');
  }
  function hideConflict(){conflictRecord=null;conflictMode=null;el('conflictActions').classList.add('hide');}
  async function verifiedSession(){const result=await client.auth.getSession();if(result.error||!result.data.session)return null;return result.data.session;}
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
    const nextId=nextSession&&nextSession.user&&nextSession.user.id||null,previousId=currentUserId;session=nextSession;
    const changed=nextId!==previousId;
    if(changed){
      sessionGeneration++;persistenceGeneration++;deletionOperationGeneration++;activeDeletion=null;deletionInProgress=false;loadInFlight=null;loadInFlightKey=null;recoveryContext=null;clearTimeout(saveTimer);saveTimer=null;saveInFlight=null;followUpSaveRequested=false;queuedSaveOptions=null;
      currentUserId=nextId;lastLoadedUserId=null;lastKnownUpdatedAt=null;cloudReady=false;loading=false;dirty=false;stateRevision=0;conflictRecord=null;conflictMode=null;logoutPending=false;recovery=false;
      clearVisibleState();hideConflict();el('logoutProtectionActions').classList.add('hide');if(el('lastCloudSave'))el('lastCloudSave').textContent='';safeMessage(nextId?'Loading this account’s Tracker…':'');cloudStatus(nextId?'Loading cloud data…':'Not signed in');setAuthView(nextSession&&nextSession.user||null);
      document.body.classList.toggle('trackerLocked',true);
    }
    if(!nextId){setAuthView(null);return;}
    if(!changed){currentUserId=nextId;setAuthView(nextSession.user);}
    if(event==='PASSWORD_RECOVERY'){recovery=true;recoveryContext={userId:nextId,sessionGeneration};cloudReady=false;setAuthView(nextSession.user);document.body.classList.toggle('trackerLocked',true);safeMessage('Enter and confirm your new password.');return;}
    if(recovery){document.body.classList.toggle('trackerLocked',true);return;}
    if(changed||lastLoadedUserId!==nextId){const generation=sessionGeneration;const loaded=await loadAuthenticatedUserState(generation,nextId);if(loaded&&generation===sessionGeneration&&nextId===currentUserId){setAuthView(nextSession.user);showScreen(conflictRecord?'profileScreen':'homeScreen');}}
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
  async function completeLogout(discard=false){
    const id=currentUserId;const result=await client.auth.signOut();if(result.error){safeMessage(friendlyError(result.error),'error');return false;}
    if(id)try{localStorage.removeItem(cacheKey(id));}catch(_e){}logoutPending=false;el('logoutProtectionActions').classList.add('hide');safeMessage(discard?'Unsaved changes were discarded and you were logged out.':'Logged out. Personal Tracker data has been cleared from this screen.','success');return true;
  }
  async function logout(){
    if(dirty){const saved=await saveAuthenticatedUserState();if(!saved){logoutPending=true;el('logoutProtectionActions').classList.remove('hide');safeMessage('Logout was stopped to protect unsaved changes. Retry saving, stay signed in, or explicitly discard the changes.','error');showScreen('profileScreen');return false;}}
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
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&cloudReady)saveAuthenticatedUserState();});window.addEventListener('pagehide',()=>{if(dirty&&cloudReady)saveAuthenticatedUserState();});window.addEventListener('online',()=>{if(dirty&&cloudReady&&!deletionInProgress)saveAuthenticatedUserState();});
  }
  async function start(){clearVisibleState();setAuthView(null);showScreen('accountScreen');if(!window.supabase||!window.supabase.createClient){cloudStatus('Offline');safeMessage('Account service could not load. Check your network connection.','error');return;}client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});bind();client.auth.onAuthStateChange((event,nextSession)=>{setTimeout(()=>handleSession(nextSession,event),0)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
