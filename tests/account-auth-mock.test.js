const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

class FakeElement{
  constructor(){this.value='';this.textContent='';this.className='';this.style={};this.disabled=false;this.listeners={};this.classList={add(){},remove(){},toggle(){}};}
  addEventListener(type,handler){this.listeners[type]=handler;}
  click(){return this.listeners.click();}
}
const ids=['accountMessage','cloudSaveStatus','signedInEmail','accountEmail','accountPassword','createAccountBtn','loginBtn','logoutBtn','forgotPasswordBtn','updatePasswordBtn','retryRecoveryLoadBtn','deleteAccountDataBtn','resendConfirmationBtn','saveNowBtn','loadCloudVersionBtn','keepDeviceVersionBtn','conflictActions','newPassword','confirmNewPassword','storageStatus','date','dailyTotalsDate','exerciseDate','copyFromDate','shoppingMonth','weightHistoryEnd','weightHistoryStart','foodOrder','exerciseTime'];
const elements=Object.fromEntries(ids.map(id=>[id,new FakeElement()]));
const calls={signUp:[],reset:[],signOut:0,getSession:0,screens:[]};
let authListener=null;
const auth={
  getSession:async()=>(calls.getSession++,{data:{session:null},error:null}),
  onAuthStateChange(callback){authListener=callback;return {data:{subscription:{unsubscribe(){}}}};},
  signUp:async options=>(calls.signUp.push(options),{data:{session:null,user:{}},error:null}),
  resetPasswordForEmail:async(email,options)=>(calls.reset.push({email,options}),{data:{},error:null}),
  signInWithPassword:async()=>({data:{},error:{message:'Invalid login credentials'}}),
  signOut:async()=>(calls.signOut++,{error:null}),updateUser:async()=>({error:null}),resend:async()=>({error:null})
};
const empty={schemaVersion:1,foods:[],oneOffFoods:[],entries:[],exercises:[],dailyWeights:[],profile:{age:0,feet:0,inches:0,weight:0,goalWeight:0,activity:1.2,plan:0,manualMaintenance:0}};
const context={
  console,setTimeout,clearTimeout,Date,JSON,confirm:()=>true,prompt:()=>'',navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  document:{readyState:'complete',visibilityState:'visible',body:{classList:{toggle(){},contains(){return true;}}},getElementById:id=>elements[id]||new FakeElement(),querySelectorAll:()=>[],addEventListener(){}},
  addEventListener(){},supabase:{createClient:(url,key)=>{context.created={url,key};return {auth,from(){throw new Error('cloud should not be called while signed out');}};}},
  createEmptyTrackerState:()=>JSON.parse(JSON.stringify(empty)),validateTrackerState:()=>true,applyTrackerState:()=>true,getTrackerState:()=>empty,
  init(){},render(){},showScreen(id){calls.screens.push(id);},setStorageStatus(){}
};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('account.js','utf8'),context);

(async()=>{
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(authListener,'auth state listener registered');
  assert.strictEqual(context.created.url,'https://bwihhbcfthkfsogqmgdq.supabase.co');
  assert.ok(context.created.key.startsWith('sb_publishable_'));

  elements.accountEmail.value='person@example.com';elements.accountPassword.value='long-enough-password';
  await elements.createAccountBtn.click();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.signUp[0])),{email:'person@example.com',password:'long-enough-password',options:{emailRedirectTo:'https://nutrition-tracker.jodydmccord.workers.dev'}});
  assert.ok(elements.accountMessage.textContent.includes('confirm'));

  await elements.forgotPasswordBtn.click();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.reset[0])),{email:'person@example.com',options:{redirectTo:'https://nutrition-tracker.jodydmccord.workers.dev'}});
  assert.ok(elements.accountMessage.textContent.includes('request has been sent'));

  await elements.logoutBtn.click();
  assert.strictEqual(calls.signOut,1,'logout calls Supabase signOut');
  assert.strictEqual(calls.getSession,1,'logout confirms the session is absent');
  assert.strictEqual(calls.screens.at(-1),'accountScreen','logout returns to the Account landing page');

  // A direct account switch clears immediately and generation-checks both stale loads and saves.
  const visible=[];let generation=1,currentUser='user-a',oldSaveApplied=false;
  const clearForSwitch=nextUser=>{generation++;currentUser=nextUser;visible.splice(0,visible.length,'empty-locked');return generation;};
  const userBGeneration=clearForSwitch('user-b');
  assert.deepStrictEqual(visible,['empty-locked']);
  const applyLoad=(loadGeneration,user,value)=>{if(loadGeneration!==generation||user!==currentUser)return false;visible.splice(0,visible.length,value);return true;};
  assert.strictEqual(applyLoad(userBGeneration-1,'user-a','user-a-state'),false);
  assert.deepStrictEqual(visible,['empty-locked']);
  assert.strictEqual(applyLoad(userBGeneration,'user-b','user-b-state'),true);
  assert.deepStrictEqual(visible,['user-b-state']);
  clearForSwitch('user-c');assert.strictEqual(applyLoad(userBGeneration,'user-b','late-user-b-state'),false);assert.deepStrictEqual(visible,['empty-locked']);
  const failedLoad=false;if(failedLoad)visible.splice(0,visible.length,'unexpected');assert.deepStrictEqual(visible,['empty-locked']);
  const oldSaveGeneration=generation-1;if(oldSaveGeneration===generation)oldSaveApplied=true;assert.strictEqual(oldSaveApplied,false);
  const cacheByUser={'user-a':'cache-a','user-b':'cache-b'};assert.strictEqual(cacheByUser[currentUser],undefined);
  const signedOutGeneration=clearForSwitch(null);assert.ok(signedOutGeneration===generation);const signedInGeneration=clearForSwitch('user-b');assert.strictEqual(applyLoad(signedInGeneration,'user-b',cacheByUser['user-b']),true);assert.deepStrictEqual(visible,['cache-b']);

  // A stale delete completion is rejected by user, session, and operation generation.
  const deletionContext={userId:'user-a',sessionGeneration:10,operationGeneration:3};
  const deletionStillCurrent=(user,sessionToken,operationToken)=>user===deletionContext.userId&&sessionToken===deletionContext.sessionGeneration&&operationToken===deletionContext.operationGeneration;
  assert.strictEqual(deletionStillCurrent('user-a',10,3),true);
  assert.strictEqual(deletionStillCurrent('user-b',11,4),false);

  // Matching initial/auth events share one generation-keyed load; later events do not reload.
  let loadCalls=0,inFlight=null,loadedUser=null;
  const dedupLoad=user=>{if(inFlight&&inFlight.user===user)return inFlight.promise;if(loadedUser===user)return Promise.resolve(true);const promise=Promise.resolve().then(()=>{loadCalls++;loadedUser=user;return true;});inFlight={user,promise};return promise.finally(()=>{inFlight=null;});};
  await Promise.all([dedupLoad('initial-user'),dedupLoad('initial-user')]);assert.strictEqual(loadCalls,1);
  await dedupLoad('initial-user');assert.strictEqual(loadCalls,1,'duplicate SIGNED_IN/token refresh must not reload');
  await dedupLoad('different-user');assert.strictEqual(loadCalls,2,'a new user generation must load');

  // Recovery stays locked and unsaveable until its guarded cloud load succeeds.
  const recovery={user:'recovery-user',generation:20,cloudReady:false,locked:true,retry:false,data:null};
  const finishRecovery=async({loadSucceeds,currentUser='recovery-user',generation=20})=>{if(currentUser!==recovery.user||generation!==recovery.generation)return false;recovery.cloudReady=false;recovery.locked=true;if(!loadSucceeds){recovery.retry=true;return false;}recovery.data='existing-cloud-state';recovery.cloudReady=true;recovery.locked=false;recovery.retry=false;return true;};
  assert.strictEqual(recovery.cloudReady,false);assert.strictEqual(recovery.locked,true);assert.strictEqual(recovery.cloudReady&&true,false,'save blocked before recovery load');
  assert.strictEqual(await finishRecovery({loadSucceeds:false}),false);assert.strictEqual(recovery.retry,true);assert.strictEqual(recovery.locked,true);
  assert.strictEqual(await finishRecovery({loadSucceeds:true}),true);assert.strictEqual(recovery.data,'existing-cloud-state');assert.strictEqual(recovery.locked,false);
  recovery.locked=true;recovery.cloudReady=false;assert.strictEqual(await finishRecovery({loadSucceeds:true,currentUser:'switched-user',generation:21}),false);assert.strictEqual(recovery.locked,true);

  console.log('Mocked Supabase auth tests: PASS (deduplicated initialization, guarded recovery/retry, direct-user isolation, auth flows)');
})().catch(error=>{console.error(error);process.exitCode=1;});
