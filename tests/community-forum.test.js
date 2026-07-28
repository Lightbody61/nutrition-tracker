const assert=require('assert');
const fs=require('fs');

const html=fs.readFileSync('index.html','utf8');
const duplicate=fs.readFileSync('nutrition-tracker.html','utf8');
const account=fs.readFileSync('account.js','utf8');
const sql=fs.readFileSync('supabase/community_forum.sql','utf8');

assert.strictEqual(html,duplicate,'HTML entry points must remain identical');
assert.ok(!/Ecommerce is not part of Stage 2/i.test(html));
assert.ok(html.includes('Send Jody a message at <a href="mailto:ClanMcCord@Hotmail.com">ClanMcCord@Hotmail.com</a>'));

const mainMenu=html.slice(html.indexOf('id="mainMenuScreen"'),html.indexOf('</section>',html.indexOf('id="mainMenuScreen"')));
for(const label of ['Proceed to Tracker','Community Forum','Back to Account']) assert.ok(mainMenu.includes(`>${label}</button>`));
assert.ok(!mainMenu.includes('>Contact Admin</button>'));

const forum=html.slice(html.indexOf('id="communityForumScreen"'),html.indexOf('</section>',html.indexOf('id="communityForumScreen"')));
for(const id of ['communityForumComment','postCommunityForumCommentBtn','refreshCommunityForumCommentsBtn','communityForumComments','communityForumStatus']) assert.ok(forum.includes(`id="${id}"`),`missing forum control: ${id}`);
assert.ok(forum.includes('<h2>Community Forum</h2>'));
assert.ok(forum.includes('maxlength="2000" required'));
assert.ok(forum.includes('data-screen="mainMenuScreen">← Back to Main Menu</button>'));

const renderBody=account.slice(account.indexOf('function renderCommunityForumComments'),account.indexOf('async function loadCommunityForumComments'));
assert.ok(renderBody.includes('text.textContent=String(comment.comment_text||\'\')'));
assert.ok(!renderBody.includes('innerHTML'));
assert.ok(account.includes("if(!comment){forumStatus('Enter a comment before posting.'"));
assert.ok(account.includes('if(comment.length>2000)'));
assert.ok(account.includes('if(forumPosting)return false'));
assert.ok(account.includes('forumPosting=true;button.disabled=true'));
assert.ok(account.includes('finally{forumPosting=false;button.disabled=false;}'));
assert.ok(account.includes("const active=await verifiedSession();if(!active||!active.user)"));
assert.ok(account.includes('user_id:active.user.id'));
assert.ok(account.includes(".order('created_at',{ascending:false}).limit(100)"));
assert.ok(account.includes("return value.slice(0,Math.min(2,at))+'***'+value.slice(at)"));
assert.ok(account.includes("textarea.value='';updateCommunityForumCharacterCount();await loadCommunityForumComments()"));

assert.ok(sql.includes('create table if not exists public.community_forum_comments'));
assert.ok(sql.includes('alter table public.community_forum_comments enable row level security'));
assert.ok(sql.includes('revoke all on table public.community_forum_comments from anon'));
assert.ok(sql.includes('for select')&&sql.includes('to authenticated')&&sql.includes('using (true)'));
assert.ok(sql.includes('for insert')&&sql.includes('with check (auth.uid() = user_id)'));
assert.ok(sql.includes('check (length(trim(comment_text)) > 0)'));
assert.ok(sql.includes('check (length(comment_text) <= 2000)'));
assert.ok(!account.includes('service_role')&&!account.includes('sb_secret'));

console.log('Community Forum tests: PASS (navigation, privacy/contact copy, safe rendering, auth-derived posts, validation, RLS)');
