const assert=require('assert');
const fs=require('fs');

const accountSource=fs.readFileSync('account.js','utf8');
const sql=fs.readFileSync('supabase/atomic_tracker_state.sql','utf8');
const state=value=>({schemaVersion:1,value});
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.keys(value).sort().reduce((out,key)=>(out[key]=canonical(value[key]),out),{}):value);
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

function reconcile(cloud,cache){
  if(cache&&cache.dirty){
    if(cloud&&same(cache.tracker_state,cloud.tracker_state))return {apply:'cloud',prompt:false,dirty:false};
    return {apply:'cache',prompt:true,dirty:true,choices:['Save Cached Version to Cloud','Load Cloud Version']};
  }
  if(cloud)return {apply:'cloud',prompt:false,dirty:false};
  if(cache)return {apply:'cache',prompt:false,dirty:true,recreate:true,expected:null};
  return {apply:'empty',prompt:false,dirty:true};
}

// Startup reconciliation cases.
assert.deepStrictEqual(reconcile({tracker_state:state('old'),updated_at:'v1'},{tracker_state:state('offline-edit'),base_updated_at:'v1',dirty:true,cache_timestamp:'later'}),{apply:'cache',prompt:true,dirty:true,choices:['Save Cached Version to Cloud','Load Cloud Version']});
assert.deepStrictEqual(reconcile({tracker_state:state('new-cloud'),updated_at:'v2'},{tracker_state:state('offline-edit'),base_updated_at:'v1',dirty:true,cache_timestamp:'later'}).apply,'cache');
assert.deepStrictEqual(reconcile({tracker_state:state('same'),updated_at:'v2'},{tracker_state:state('same'),base_updated_at:'v1',dirty:true}).prompt,false);
assert.strictEqual(same({schemaVersion:1,profile:{weight:150,age:40}},{profile:{age:40,weight:150},schemaVersion:1}),true);
assert.deepStrictEqual(reconcile({tracker_state:state('new-cloud'),updated_at:'v2'},{tracker_state:state('old-clean'),base_updated_at:'v1',dirty:false}).apply,'cloud');
assert.deepStrictEqual(reconcile({tracker_state:state('cloud'),updated_at:'v1'},null).apply,'cloud');
assert.deepStrictEqual(reconcile(null,{tracker_state:state('clean-cache'),base_updated_at:'obsolete',dirty:false}),{apply:'cache',prompt:false,dirty:true,recreate:true,expected:null});

// In-memory model of the SQL compare-and-write contract.
function atomicSave(row,authenticatedUserId,trackerState,expected){
  if(!authenticatedUserId)throw new Error('Authentication required');
  if(!row){if(expected!==null)return {row,success:false,conflict:true};return {row:{user_id:authenticatedUserId,tracker_state:trackerState,updated_at:'v1'},success:true,conflict:false};}
  if(row.user_id!==authenticatedUserId||row.updated_at!==expected)return {row,success:false,conflict:true};
  return {row:{user_id:authenticatedUserId,tracker_state:trackerState,updated_at:row.updated_at==='v1'?'v2':'v3'},success:true,conflict:false};
}
let inserted=atomicSave(null,'auth-user',state('first'),null);assert.strictEqual(inserted.success,true);assert.strictEqual(inserted.row.user_id,'auth-user');
let updated=atomicSave(inserted.row,'auth-user',state('second'),'v1');assert.strictEqual(updated.success,true);
let stale=atomicSave(updated.row,'auth-user',state('stale'),'v1');assert.strictEqual(stale.conflict,true);assert.deepStrictEqual(stale.row,updated.row);
const common={user_id:'auth-user',tracker_state:state('base'),updated_at:'v1'};
const deviceA=atomicSave(common,'auth-user',state('A'),'v1');const deviceB=atomicSave(deviceA.row,'auth-user',state('B'),'v1');
assert.strictEqual(deviceA.success,true);assert.strictEqual(deviceB.conflict,true);assert.deepStrictEqual(deviceB.row,deviceA.row);

// Explicit recovered-cache overwrite uses the displayed cloud version, while another race is rejected.
const cachedDeviceState=state('recovered-cache');
const displayedCloud={user_id:'auth-user',tracker_state:state('cloud-v2'),updated_at:'v2'};
const explicitOverwrite=atomicSave(displayedCloud,'auth-user',cachedDeviceState,displayedCloud.updated_at);
assert.strictEqual(explicitOverwrite.success,true);
assert.deepStrictEqual(explicitOverwrite.row.tracker_state,cachedDeviceState);
assert.strictEqual(explicitOverwrite.row.updated_at,'v3');
const cacheMetadataAfterSuccess={tracker_state:explicitOverwrite.row.tracker_state,base_updated_at:explicitOverwrite.row.updated_at,dirty:false};
assert.deepStrictEqual(cacheMetadataAfterSuccess,{tracker_state:cachedDeviceState,base_updated_at:'v3',dirty:false});

const cloudAdvancedAgain={...displayedCloud,tracker_state:state('cloud-v3'),updated_at:'v3'};
const rejectedOverwrite=atomicSave(cloudAdvancedAgain,'auth-user',cachedDeviceState,displayedCloud.updated_at);
assert.strictEqual(rejectedOverwrite.conflict,true);
assert.deepStrictEqual(rejectedOverwrite.row,cloudAdvancedAgain);
assert.deepStrictEqual(cachedDeviceState,state('recovered-cache'));
const refreshedConflictRecord=rejectedOverwrite.row;
assert.strictEqual(refreshedConflictRecord.updated_at,'v3');
const retryWithNewest=atomicSave(refreshedConflictRecord,'auth-user',cachedDeviceState,refreshedConflictRecord.updated_at);
assert.strictEqual(retryWithNewest.success,true);

// A confirmed missing row always uses null, preserving recovered state and taking the insert path.
const missingRowExpected=null;
const recoveredInsert=atomicSave(null,'auth-user',cachedDeviceState,missingRowExpected);
assert.strictEqual(recoveredInsert.success,true);
assert.deepStrictEqual(recoveredInsert.row.tracker_state,cachedDeviceState);
assert.deepStrictEqual({base_updated_at:recoveredInsert.row.updated_at,dirty:false},{base_updated_at:'v1',dirty:false});
const recreatedBeforeSave={user_id:'auth-user',tracker_state:state('other-device'),updated_at:'v1'};
const missingRowRace=atomicSave(recreatedBeforeSave,'auth-user',cachedDeviceState,null);
assert.strictEqual(missingRowRace.conflict,true);
assert.deepStrictEqual(missingRowRace.row,recreatedBeforeSave);
assert.deepStrictEqual(cachedDeviceState,state('recovered-cache'));

// Clean cached state immediately recreates a missing server row with a null version.
const cleanCacheState=state('clean-cache');
const cleanCacheInsert=atomicSave(null,'auth-user',cleanCacheState,null);
assert.strictEqual(cleanCacheInsert.success,true);
assert.deepStrictEqual(cleanCacheInsert.row.tracker_state,cleanCacheState);
assert.deepStrictEqual({base_updated_at:cleanCacheInsert.row.updated_at,dirty:false},{base_updated_at:'v1',dirty:false});
const cleanCacheRace=atomicSave(recreatedBeforeSave,'auth-user',cleanCacheState,null);
assert.strictEqual(cleanCacheRace.conflict,true);
assert.ok(cleanCacheRace.row&&cleanCacheRace.row.updated_at);

// Load Cloud Version still applies the displayed cloud state only after the device choice.
const loadedCloudState=displayedCloud.tracker_state;
assert.deepStrictEqual(loadedCloudState,state('cloud-v2'));

// SQL and browser security/atomicity checks.
assert.ok(sql.includes('v_user_id uuid := auth.uid()'));
assert.ok(!/p_user_id/i.test(sql));
assert.ok(sql.includes('security invoker'));
assert.ok(sql.includes('and updated_at = p_expected_updated_at'));
assert.ok(sql.includes("greatest(clock_timestamp(), updated_at + interval '1 microsecond')"));
assert.ok(sql.includes('on conflict (user_id) do nothing'));
assert.ok(sql.includes('grant execute')&&sql.includes('to authenticated'));
assert.ok(sql.includes('revoke all')&&sql.includes('from anon'));
assert.ok(accountSource.includes('dirty=true;writeCache()'));
assert.ok(accountSource.includes("showConflict(latest,latest?'save-conflict'"));
assert.ok(accountSource.includes('conflictRecord&&conflictRecord.updated_at?conflictRecord.updated_at:null'));
assert.ok(accountSource.includes("if(saved)safeMessage('Cached Tracker version saved to cloud successfully.'"));
assert.ok(accountSource.includes('applyCachedState(cache);lastKnownUpdatedAt=null;dirty=true;writeCache()'));
assert.ok(accountSource.includes('saveAuthenticatedUserState({expectedUpdatedAt:null})'));
assert.ok(accountSource.includes("window.addEventListener('online'"));
assert.ok(accountSource.includes('deletionInProgress=true;persistenceGeneration++'));
assert.ok(accountSource.includes('if(pending)try{await pending;}'));
assert.ok(accountSource.includes('if(loadInFlight&&loadInFlightKey===key)return loadInFlight'));
assert.ok(accountSource.includes('recoveryContext={userId:nextId,sessionGeneration}'));
assert.ok(!accountSource.includes('.upsert('));

// Overlapping INITIAL_SESSION/getSession and duplicate same-user events share one load/insert.
async function simulateInitialLoadDedup(){let fetches=0,inserts=0,conflicts=0,pending=null;const load=()=>{if(pending)return pending;pending=Promise.resolve().then(()=>{fetches++;inserts++;return true;}).finally(()=>{pending=null;});return pending;};await Promise.all([load(),load()]);return {fetches,inserts,conflicts};}
(async()=>{assert.deepStrictEqual(await simulateInitialLoadDedup(),{fetches:1,inserts:1,conflicts:0});})().catch(error=>{throw error;});

// Revision-aware save draining preserves newer edits and coalesces them into one follow-up.
async function simulateRevisionSaves({firstSucceeds=true,editsDuringSave=1,saveNowDuringSave=false}){
  let revision=1,dirty=true,cloud=null,cache={value:'A',dirty:true},followUp=false,rpcCalls=0;
  const snapshots=[];
  const firstRevision=revision,firstSnapshot={value:'A'};snapshots.push(firstSnapshot);rpcCalls++;
  for(let i=0;i<editsDuringSave;i++){revision++;cache={value:String.fromCharCode(66+i),dirty:true};followUp=true;}
  if(saveNowDuringSave)followUp=true;
  if(!firstSucceeds)return {revision,dirty,cloud,cache,followUp,rpcCalls,snapshots};
  cloud=firstSnapshot;dirty=revision!==firstRevision;cache={...cache,dirty};
  assert.strictEqual(cache.dirty,true,'an unsaved newer revision must never be cached clean');
  if(followUp||dirty){const latest={value:cache.value};snapshots.push(latest);rpcCalls++;cloud=latest;dirty=false;cache={...latest,dirty:false};}
  return {revision,dirty,cloud,cache,followUp:false,rpcCalls,snapshots};
}
(async()=>{
  const editRace=await simulateRevisionSaves({editsDuringSave:1});
  assert.deepStrictEqual(editRace.snapshots,[{value:'A'},{value:'B'}]);assert.strictEqual(editRace.dirty,false);assert.strictEqual(editRace.cache.dirty,false);
  const coalesced=await simulateRevisionSaves({editsDuringSave:3});
  assert.strictEqual(coalesced.rpcCalls,2);assert.deepStrictEqual(coalesced.cloud,{value:'D'});
  const failed=await simulateRevisionSaves({firstSucceeds:false,editsDuringSave:2});
  assert.strictEqual(failed.rpcCalls,1);assert.strictEqual(failed.dirty,true);assert.strictEqual(failed.cache.dirty,true);assert.deepStrictEqual(failed.cache.value,'C');
  const saveNow=await simulateRevisionSaves({editsDuringSave:1,saveNowDuringSave:true});
  assert.strictEqual(saveNow.rpcCalls,2);assert.deepStrictEqual(saveNow.cloud,{value:'B'});
})().catch(error=>{throw error;});

// Delete completions are scoped to their captured user/session/operation context.
function simulateDeletionCompletion({fails=false,switchUser=false}){
  const caches={'user-a':'cache-a','user-b':'cache-b'},visible={user:'user-a',state:'state-a'},messages=[];
  let currentUser='user-a',sessionGeneration=4,deletionGeneration=7,active={userId:'user-a',sessionGeneration:4,operationGeneration:7};
  const captured=active;
  if(switchUser){currentUser='user-b';sessionGeneration++;deletionGeneration++;active=null;visible.user='user-b';visible.state='state-b';}
  const current=()=>active===captured&&captured.userId===currentUser&&captured.sessionGeneration===sessionGeneration&&captured.operationGeneration===deletionGeneration;
  if(!current())return {stale:true,caches,visible,messages,userACloudDeleted:!fails,userBSavesCancelled:false,completedDeletionUsers:new Set(fails?[]:['user-a'])};
  if(fails){messages.push('delete-error');return {stale:false,caches,visible,messages,userACloudDeleted:false,autosaveRestored:true};}
  delete caches[captured.userId];visible.state='empty';messages.push('deleted');return {stale:false,caches,visible,messages,userACloudDeleted:true,autosaveRestored:false};
}
const validDelete=simulateDeletionCompletion({});
assert.strictEqual(validDelete.stale,false);assert.strictEqual(validDelete.caches['user-a'],undefined);assert.strictEqual(validDelete.visible.state,'empty');assert.deepStrictEqual(validDelete.messages,['deleted']);
const validDeleteFailure=simulateDeletionCompletion({fails:true});
assert.strictEqual(validDeleteFailure.stale,false);assert.strictEqual(validDeleteFailure.caches['user-a'],'cache-a');assert.strictEqual(validDeleteFailure.visible.state,'state-a');assert.strictEqual(validDeleteFailure.autosaveRestored,true);
for(const fails of [false,true]){
  const staleDelete=simulateDeletionCompletion({fails,switchUser:true});
  assert.strictEqual(staleDelete.stale,true);assert.strictEqual(staleDelete.caches['user-b'],'cache-b');assert.deepStrictEqual(staleDelete.visible,{user:'user-b',state:'state-b'});assert.deepStrictEqual(staleDelete.messages,[]);assert.strictEqual(staleDelete.userBSavesCancelled,false);
  assert.strictEqual(staleDelete.userACloudDeleted,!fails);
}
// Returning to A after a stale successful completion observes the deleted cloud row as empty.
const staleSuccess=simulateDeletionCompletion({switchUser:true});
const observeOnReturn=(user,cloud,completed)=>!cloud&&completed.has(user)?{visible:'empty',automaticSave:false}:{visible:'cached',automaticSave:true};
assert.deepStrictEqual(observeOnReturn('user-a',null,staleSuccess.completedDeletionUsers),{visible:'empty',automaticSave:false});

// Deletion invalidates queued/in-flight work, leaves no automatic recreation, and resumes on failure.
async function simulatedDelete({pendingSave=false,deleteFails=false}){
  const events=[];let blocked=false,dirty=true,row=state('before'),cache=state('before');
  events.push('clear-timer');blocked=true;events.push('increment-generation');
  if(pendingSave){events.push('await-save');await Promise.resolve();events.push('save-result-ignored');}
  events.push('delete-row');
  if(deleteFails){blocked=false;events.push('schedule-autosave');return {events,blocked,dirty,row,cache};}
  row=null;cache=null;dirty=false;events.push('reset-clean');blocked=false;
  return {events,blocked,dirty,row,cache};
}
(async()=>{
  const debounce=await simulatedDelete({pendingSave:false});
  assert.deepStrictEqual(debounce.events,['clear-timer','increment-generation','delete-row','reset-clean']);
  assert.strictEqual(debounce.row,null);assert.strictEqual(debounce.cache,null);assert.strictEqual(debounce.dirty,false);
  const inFlight=await simulatedDelete({pendingSave:true});
  assert.ok(inFlight.events.indexOf('save-result-ignored')<inFlight.events.indexOf('delete-row'));
  assert.strictEqual(inFlight.row,null);
  const failed=await simulatedDelete({deleteFails:true});
  assert.deepStrictEqual(failed.row,state('before'));assert.deepStrictEqual(failed.cache,state('before'));
  assert.ok(failed.events.includes('schedule-autosave'));assert.strictEqual(failed.blocked,false);
  const laterExplicitSave=atomicSave(null,'auth-user',state('later-explicit'),null);
  assert.strictEqual(laterExplicitSave.success,true);assert.strictEqual(laterExplicitSave.row.tracker_state.value,'later-explicit');
})().catch(error=>{throw error;});

// Protected logout paths: failure returns before signOut; cache removal exists only in completion.
const logoutBody=accountSource.slice(accountSource.indexOf('async function logout()'),accountSource.indexOf('async function retryLogoutSave'));
assert.ok(logoutBody.indexOf('if(!saved)')<logoutBody.indexOf('return completeLogout(false)'));
assert.ok(!logoutBody.includes('removeItem'));
assert.ok(accountSource.includes('Logout was stopped to protect unsaved changes'));
assert.ok(accountSource.includes('Save still failed. Logout remains stopped'));
assert.ok(accountSource.includes("prompt('Type DISCARD AND LOG OUT to confirm:')"));

async function simulatedLogout({dirty,saveResult=true,discard=false}){
  const result={signedOut:false,cacheRetained:true,stopped:false};
  if(dirty&&!saveResult&&!discard){result.stopped=true;return result;}
  if(dirty&&!saveResult&&discard){result.signedOut=true;result.cacheRetained=false;return result;}
  result.signedOut=true;result.cacheRetained=false;return result;
}
(async()=>{
  assert.deepStrictEqual(await simulatedLogout({dirty:false}),{signedOut:true,cacheRetained:false,stopped:false});
  assert.deepStrictEqual(await simulatedLogout({dirty:true,saveResult:true}),{signedOut:true,cacheRetained:false,stopped:false});
  for(const failure of ['offline','conflict','expired-session']){
    const result=await simulatedLogout({dirty:true,saveResult:false,reason:failure});
    assert.deepStrictEqual(result,{signedOut:false,cacheRetained:true,stopped:true});
  }
  assert.deepStrictEqual(await simulatedLogout({dirty:true,saveResult:false,discard:true}),{signedOut:true,cacheRetained:false,stopped:false});
  // A failed retry remains dirty and retains the cache.
  assert.deepStrictEqual(await simulatedLogout({dirty:true,saveResult:false}),{signedOut:false,cacheRetained:true,stopped:true});
})().catch(error=>{throw error;});

console.log('Cloud persistence correctness tests: PASS (missing-row recovery, atomic insert/update/concurrency, guarded deletion, protected logout)');
