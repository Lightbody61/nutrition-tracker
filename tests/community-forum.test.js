const assert=require('assert');
const fs=require('fs');

const html=fs.readFileSync('index.html','utf8');
const duplicate=fs.readFileSync('nutrition-tracker.html','utf8');
const account=fs.readFileSync('account.js','utf8');
const sql=fs.readFileSync('supabase/community_forum_v2.sql','utf8');
const setup=fs.readFileSync('supabase/COMMUNITY_FORUM_SETUP.md','utf8');

assert.strictEqual(html,duplicate,'HTML entry points must remain identical');
assert.ok(!/Ecommerce is not part of Stage 2/i.test(html));
assert.ok(html.includes('Send Jody a message at <a href="mailto:ClanMcCord@Hotmail.com">ClanMcCord@Hotmail.com</a>'));
const mainMenu=html.slice(html.indexOf('id="mainMenuScreen"'),html.indexOf('</section>',html.indexOf('id="mainMenuScreen"')));
for(const label of ['Proceed to Tracker','Community Forum','Back to Account']) assert.ok(mainMenu.includes(`>${label}</button>`));
assert.ok(!mainMenu.includes('>Contact Admin</button>'));

for(const id of ['forumScreenNameForm','forumScreenName','saveForumScreenNameBtn','forumPostingAs','changeForumScreenNameBtn','communityForumComment','postCommunityForumCommentBtn','refreshCommunityForumCommentsBtn','forumAdministrationBtn','communityForumComments','communityForumStatus']) assert.ok(html.includes(`id="${id}"`),`missing forum control: ${id}`);
for(const id of ['forumAdministrationScreen','forumAdminUserSearch','forumAdminUsers','forumAdminCommentSearch','forumAdminComments','refreshForumAdministrationBtn','forumAdminStatus']) assert.ok(html.includes(`id="${id}"`),`missing administration control: ${id}`);
assert.ok(html.includes('<h2>Forum Administration</h2>'));
assert.ok(html.includes('maxlength="2000" required'));

// Forum-specific diagnostics replace the generic account-service fallback.
assert.ok(account.includes("code==='42P01'||code==='PGRST202'||code==='PGRST205'"));
assert.ok(account.includes('The Forum database has not been installed. Run community_forum_v2.sql in Supabase.'));
assert.ok(account.includes('That screen name is already taken.'));
assert.ok(account.includes('Forum permission was denied by the database security policy.'));
assert.ok(account.includes('The Forum could not reach Supabase.'));
assert.ok(account.includes('The Community Forum could not complete that request.'));
assert.ok(account.includes("console.error('Community Forum operation failed',error)"));
const forumCode=account.slice(account.indexOf('const forumStatus='),account.indexOf('async function completeLogout'));
assert.ok(!forumCode.includes('friendlyError('),'forum errors must not be mislabeled as account errors');

// Required, validated, case-insensitively unique screen names.
for(const text of ['Screen name is required.','between 3 and 30 characters','letters, numbers, spaces, underscores, and hyphens','must not be an email address','That screen name is reserved.','Screen name is required before posting or replying.']) assert.ok(account.includes(text));
for(const reserved of ['admin','administrator','moderator','nutrition tracker','system']) assert.ok(account.includes(`'${reserved}'`));
assert.ok(sql.includes('create unique index if not exists forum_profiles_screen_name_unique on public.forum_profiles (lower(screen_name))'));
assert.ok(sql.includes("check (length(trim(screen_name)) between 3 and 30)"));
assert.ok(sql.includes("screen_name ~ '^[A-Za-z0-9 _-]+$'")||sql.includes("trim(screen_name) ~ '^[A-Za-z0-9 _-]+$'"));
assert.ok(sql.includes("check (position('@' in screen_name) = 0)"));
assert.ok(account.includes("from('forum_profiles').update({screen_name:checked.name})"));

// Current names are resolved by user_id; no copied author or email is displayed.
assert.ok(account.includes("from('forum_profiles').select('user_id,screen_name').in('user_id',ids)"));
assert.ok(account.includes('forumProfiles.set(profile.user_id,profile.screen_name)'));
assert.ok(!forumCode.includes('author_name')&&!forumCode.includes('.email'));
assert.ok(!account.includes("from('auth.users')")&&!account.includes('is_admin'));
const renderCode=account.slice(account.indexOf('function renderForumComment'),account.indexOf('async function loadCommunityForumComments'));
assert.ok(renderCode.includes('text.textContent=String(comment.comment_text||\'\')'));
assert.ok(renderCode.includes("new Date(comment.created_at).toLocaleString()"));
assert.ok(!renderCode.includes('innerHTML'));
assert.ok(renderCode.includes("actions.className='forumCommentActions'"));
assert.ok(renderCode.includes("forumButton('Reply'"));
assert.ok(renderCode.includes("const likeLabel='Like'"));
assert.ok(!renderCode.includes("forumButton('Delete'"),'delete must not appear in the bulletin board comment UI');
assert.ok(!/dislike|thumbs?\s*down/i.test(renderCode),'negative reactions must not appear in the bulletin board comment UI');
for(const compactStyle of ['.forumCommentActions{display:flex','gap:8px','width:auto','padding:4px 10px']) assert.ok(html.includes(compactStyle),`missing compact forum style: ${compactStyle}`);

// Thread ordering and one-level reply behavior.
assert.ok(account.includes("filter(comment=>!comment.parent_comment_id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))"));
assert.ok(account.includes("filter(reply=>reply.parent_comment_id===comment.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))"));
assert.ok(account.includes('const topId=comment.parent_comment_id||comment.id'));
assert.ok(account.includes('reply_to_user_id:replyToUserId'));
assert.ok(account.includes("label+=' · Replying to '+forumName(comment.reply_to_user_id)"));

// Posts/replies use session UUIDs, preserve text on failure, clear only on success, and deduplicate.
assert.ok(account.includes('if(forumPosting)return false'));
assert.ok(account.includes('forumPosting=true;button.disabled=true'));
assert.ok(account.includes('finally{forumPosting=false;button.disabled=!forumProfile;}'));
assert.ok(account.includes('user_id:active.user.id,parent_comment_id:parentCommentId,reply_to_user_id:replyToUserId'));
assert.ok(account.indexOf("textarea.value=''",account.indexOf('async function postForumText'))>account.indexOf('if(result.error)',account.indexOf('async function postForumText')));
assert.ok(account.includes("if(parentCommentId){if(replyForm)replyForm.remove();}"));
assert.ok(account.includes("Enter a reply before posting."));

// Deletion remains available only through protected administration.
assert.ok(account.includes("message=isReply?'Delete this reply?':'Delete this comment and any replies to it?'"));
assert.ok(account.includes("from('community_forum_comments').delete().eq('id',comment.id)"));
assert.ok(account.includes("if(!forumIsAdmin){showScreen('communityForumScreen');forumStatus('Administrator access is required.'"));
assert.ok(account.includes("client.rpc('is_forum_admin')"));
assert.ok(html.includes("id==='forumAdministrationScreen'&&window.forumAdminAccessConfirmed!==true"));
assert.ok(account.includes('window.forumAdminAccessConfirmed=forumIsAdmin'));
assert.ok(!account.includes("from('forum_admins')"),'browser must not read or modify forum_admins');
assert.ok(account.includes("profile.screen_name+' · '+profile.user_id"));
assert.ok(!account.slice(account.indexOf('function renderForumAdministration'),account.indexOf('async function completeLogout')).includes('.email'));

// Likes are per-user, countable, toggleable, and protected by RLS.
assert.ok(account.includes("from('forum_comment_likes').select('comment_id,user_id')"));
assert.ok(account.includes("client.from('forum_comment_likes').insert({comment_id:comment.id,user_id:active.user.id})"));
assert.ok(account.includes("client.from('forum_comment_likes').delete().eq('comment_id',comment.id).eq('user_id',active.user.id)"));
assert.ok(sql.includes('create table if not exists public.forum_comment_likes'));
assert.ok(sql.includes('primary key (comment_id, user_id)'));
assert.ok(sql.includes('alter table public.forum_comment_likes enable row level security'));
assert.ok(sql.includes('Authenticated users can read forum likes'));
assert.ok(sql.includes('Users can add their own forum likes'));
assert.ok(sql.includes('Users can remove their own forum likes'));

// Consolidated, rerunnable migration preserves old comments and enforces RLS.
for(const table of ['forum_profiles','forum_admins','community_forum_comments']) assert.ok(sql.includes(`alter table public.${table} enable row level security`));
assert.ok(sql.includes('create table if not exists public.community_forum_comments'));
assert.ok(sql.includes('add column if not exists parent_comment_id'));
assert.ok(sql.includes('add column if not exists reply_to_user_id'));
assert.ok(!sql.includes('drop table')&&!sql.includes('truncate'));
for(const index of ['created_at_idx','parent_comment_id_idx','user_id_idx','reply_to_user_id_idx']) assert.ok(sql.includes(index));
assert.ok(sql.includes('create or replace function public.is_forum_admin()'));
assert.ok(sql.includes('security definer')&&sql.includes('set search_path = public, pg_temp'));
assert.ok(sql.includes('where user_id = auth.uid()'));
assert.ok(sql.includes('revoke all on table public.forum_admins from anon, authenticated'));
assert.ok(sql.includes('Profiled users can create their own forum comments'));
assert.ok(sql.includes('auth.uid() = user_id and exists'));
assert.ok(sql.includes('auth.uid() = user_id or public.is_forum_admin()'));
assert.ok(sql.includes('revoke all on table public.community_forum_comments from anon'));
assert.ok(!account.includes('service_role')&&!account.includes('sb_secret'));

assert.ok(setup.includes('Run all contents of `supabase/community_forum_v2.sql`'));
assert.ok(setup.includes("values ('ACTUAL_UUID')"));
assert.ok(setup.includes('Authentication → Users'));

console.log('Community Forum v2 tests: PASS (profiles, replies, dates, moderation, deletion, diagnostics, consolidated RLS migration)');
