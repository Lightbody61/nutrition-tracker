const assert=require('assert');
const fs=require('fs');

const source=fs.readFileSync('account.js','utf8');
const html=fs.readFileSync('index.html','utf8');

// Configuration and browser-only architecture.
assert.ok(source.includes("const SUPABASE_URL='https://bwihhbcfthkfsogqmgdq.supabase.co'"));
assert.ok(source.includes("const SUPABASE_PUBLISHABLE_KEY='sb_publishable_"));
assert.ok(source.includes("AUTH_REDIRECT_URL='https://nutrition-tracker.jodydmccord.workers.dev'"));
assert.ok(html.includes('@supabase/supabase-js@2.53.0'));
assert.ok(!source.includes('service_role')&&!source.includes('sb_secret'));

// Authentication controls and safe user-facing flows.
for(const id of ['accountEmail','accountPassword','createAccountBtn','loginBtn','forgotPasswordBtn','resendConfirmationBtn','signedInEmail','saveNowBtn','logoutBtn','deleteAccountDataBtn','newPassword','confirmNewPassword','updatePasswordBtn','retryRecoveryLoadBtn','retryLogoutSaveBtn','staySignedInBtn','discardAndLogoutBtn']) assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
for(const call of ['auth.signUp','auth.signInWithPassword','auth.signOut','auth.resetPasswordForEmail','auth.updateUser','auth.resend','auth.onAuthStateChange','auth.getSession']) assert.ok(source.includes(call),`missing ${call}`);
assert.ok(source.includes("event==='PASSWORD_RECOVERY'"));
assert.ok(source.includes('lastLoadedUserId!==nextId'));
assert.ok(source.includes('if(loadInFlight&&loadInFlightKey===key)return loadInFlight'));
assert.ok(source.includes('await finishRecoveryLoad(context)'));
assert.ok(source.includes("safeMessage('Password changed successfully, but Tracker data could not be loaded. Choose Retry Load.'"));
assert.ok(source.includes("if(recovery){document.body.classList.toggle('trackerLocked',true);return;}"));
const startBody=source.slice(source.indexOf('async function start()'),source.indexOf("if(document.readyState==='loading'"));
assert.ok(startBody.includes('auth.onAuthStateChange'));
assert.ok(!startBody.includes('auth.getSession'),'boot must use the authoritative INITIAL_SESSION callback only');
assert.ok(startBody.includes("showScreen('publicLandingScreen')"),'fresh loads must start on the public landing screen');
assert.ok(source.includes("else if(event==='INITIAL_SESSION')showScreen(accountRequested?'accountScreen':'publicLandingScreen')"),'an existing session must not bypass the landing screen');
assert.ok(source.includes("else{accountRequested=false;showScreen('mainMenuScreen');}"),'interactive authentication must open Main Menu');
assert.ok(source.includes("accountRequested=false;await handleSession(null,'SIGNED_OUT')"));

// Cloud reads/writes always derive IDs from the authenticated session; no form/URL user ID exists.
assert.ok(source.includes("from('tracker_states')"));
assert.ok(source.includes(".eq('user_id',userId)"));
assert.ok(source.includes("client.rpc(SAVE_RPC,{p_tracker_state:trackerState,p_schema_version:TRACKER_SCHEMA_VERSION,p_expected_updated_at:expected})"));
assert.ok(!source.includes('.upsert('));
assert.ok(source.includes('active.user.id!==currentUserId'));
assert.ok(!html.includes('id="userId"')&&!html.includes('name="user_id"'));
assert.ok(source.includes('validateTrackerState(cloud.tracker_state)'));
assert.ok(source.includes('getTrackerState()'));
assert.ok(source.includes('applyTrackerState(record.tracker_state)'));

// Load failure, debounce, cache isolation, separation, and conflict safeguards.
assert.ok(source.includes("CACHE_PREFIX='nutritionTracker.accountCache.'"));
assert.ok(source.includes('value.user_id!==id'));
assert.ok(source.includes('SAVE_DEBOUNCE_MS=1800'));
assert.ok(source.includes("cloudReady=false;cloudStatus('Loading cloud data…')"));
assert.ok(source.includes('base_updated_at:lastKnownUpdatedAt'));
assert.ok(source.includes('cache.dirty'));
assert.ok(source.includes("mode==='cache-recovery'?'Save Cached Version to Cloud'"));
assert.ok(source.includes("confirm('Overwrite the displayed cloud version"));
assert.ok(source.includes("confirm('Overwrite the currently displayed cloud version with the recovered cached Tracker state"));
assert.ok(source.includes('conflictRecord&&conflictRecord.updated_at?conflictRecord.updated_at:null'));
assert.ok(source.includes('applyCachedState(cache);lastKnownUpdatedAt=null;dirty=true;writeCache()'));
assert.ok(source.includes('const savedRevision=stateRevision'));
assert.ok(source.includes('dirty=stateRevision!==savedRevision'));
assert.ok(source.includes('if(saveInFlight){followUpSaveRequested=true;queuedSaveOptions=options;return saveInFlight;}'));
assert.ok(source.includes('while(followUpSaveRequested||dirty)'));
assert.ok(source.includes('sessionGeneration++;persistenceGeneration++'));
assert.ok(source.includes("document.body.classList.toggle('trackerLocked',true)"));
assert.ok(source.includes("window.addEventListener('online'"));
assert.ok(source.includes('const deletionContext={userId:active.user.id,sessionGeneration,operationGeneration:++deletionOperationGeneration}'));
assert.ok(source.includes('if(!deletionIsCurrent()){if(!result.error)completedDeletionUsers.add(deletionContext.userId);return;}'));
assert.ok(source.includes('localStorage.removeItem(cacheKey(deletionContext.userId))'));
assert.ok(source.includes('deletionInProgress=true;persistenceGeneration++'));
assert.ok(source.includes('if(deletionInProgress)return false'));
assert.ok(source.includes('if(pending)try{await pending;}'));
assert.ok(source.includes("if(dirty)saveTimer=setTimeout(()=>saveAuthenticatedUserState(),SAVE_DEBOUNCE_MS)"));
assert.ok(source.includes("confirm('Discard unsaved cached/device changes"));
assert.ok(source.includes('clearVisibleState()'));
assert.ok(!source.includes('localStorage.removeItem(cacheKey(id))'),'logout must preserve account-scoped tracker cache');
assert.ok(source.includes("if(conflictRecord)showScreen('accountScreen')"));
assert.ok(source.includes('const confirmed=await client.auth.getSession()'));
assert.ok(source.includes("await handleSession(null,'SIGNED_OUT')"));
assert.ok(source.includes("if(logoutInProgress&&nextSession&&event!=='SIGNED_OUT')return"));
assert.ok(source.includes("navigator.onLine===false?'Offline':'Error'"));
assert.ok(source.includes('if(dirty){const saved=await saveAuthenticatedUserState();if(!saved)'));
assert.ok(source.includes("Type DISCARD AND LOG OUT"));

// Privacy: sanitized contact diagnostics are allowed; tokens are never logged or placed in URL/history.
assert.ok(!source.includes('console.log'));
assert.ok(!source.includes('console.error(active')&&!source.includes('console.warn(active'));
assert.ok(!source.includes('location.search')&&!source.includes('location.hash')&&!source.includes('history.'));
assert.ok(source.includes('active.access_token'));
assert.ok(!source.includes('refresh_token'));

console.log('Account module tests: PASS (auth flows, session-derived IDs, cloud boundary, cache separation, debounce, conflicts, recovery, privacy)');
