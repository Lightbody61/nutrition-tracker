const assert=require('assert');
const fs=require('fs');

const html=fs.readFileSync('index.html','utf8');
const account=fs.readFileSync('account.js','utf8');
const edge=fs.readFileSync('supabase/functions/contact-admin/index.ts','utf8');
const migration=fs.readFileSync('supabase/contact_messages.sql','utf8');

const mainMenu=html.slice(html.indexOf('id="mainMenuScreen"'),html.indexOf('</section>',html.indexOf('id="mainMenuScreen"')));
assert.strictEqual((mainMenu.match(/<button\b/g)||[]).length,4);
for(const label of ['Proceed to Tracker','Community Forum','Admin','Back to Account']) assert.ok(mainMenu.includes(`>${label}</button>`));
assert.ok(mainMenu.includes('class="secondary hide" id="adminMenuBtn"'));
assert.ok(!mainMenu.includes('>Contact Admin</button>'));
for(const id of ['contactName','contactEmail','contactSubject','contactMessage','sendContactBtn','contactStatus']) assert.ok(html.includes(`id="${id}"`));
assert.ok(html.includes('<h2>Contact Administrator</h2>'));
assert.ok(account.includes("client.functions.invoke('contact-admin'"));
assert.ok(account.includes('Authorization:`Bearer ${active.access_token}`'));
assert.ok(account.includes('Your message could not be sent. Please try again.'));
assert.ok(account.includes('Message saved, but email delivery failed.'));
assert.ok(account.includes("data.ok===true&&data.stored===true&&data.delivered===true"));
assert.ok(account.includes('button.disabled=true'));
assert.ok(account.includes('if(button.disabled)return'));
assert.ok(account.includes('finally{button.disabled=false;}'));
assert.ok(!account.includes('clanmccord@hotmail.com'),'recipient must not exist in frontend JavaScript');
assert.ok(edge.includes("Deno.env.get('ADMIN_EMAIL') || 'clanmccord@hotmail.com'"));
assert.ok(edge.includes('authClient.auth.getUser()'));
assert.ok(edge.includes('user_id: user.id'));
assert.ok(edge.indexOf("from('contact_messages').insert")<edge.indexOf("fetch('https://api.resend.com/emails'"));
assert.ok(edge.includes("Deno.env.get('RESEND_API_KEY')"));
assert.ok(edge.includes("Deno.env.get('CONTACT_FROM_EMAIL')"));
assert.ok(!edge.includes('input.recipient')&&!edge.includes('input.to'));
assert.ok(edge.includes("{ ok: true, stored: true, delivered: true }"));
assert.ok(edge.includes("{ ok: false, stored: true, delivered: false, error }"));
assert.ok(migration.includes('alter table public.contact_messages enable row level security'));
assert.ok(migration.includes('with check (user_id = auth.uid())'));
assert.ok(migration.includes('revoke select, update, delete on public.contact_messages from authenticated'));
for(const field of ['delivery_error','provider_message_id','delivered_at']) assert.ok(migration.includes(field),`missing contact delivery field: ${field}`);

const contact=html.slice(html.indexOf('id="contactScreen"'),html.indexOf('</section>',html.indexOf('id="contactScreen"')));
assert.ok(contact.includes('data-screen="mainMenuScreen">← Back to Main Menu</button>'));
const profile=html.slice(html.indexOf('id="profileScreen"'),html.indexOf('</section>',html.indexOf('id="profileScreen"')));
assert.ok(profile.includes('data-screen="homeScreen">← Back to Menu</button>'));
assert.ok(!profile.includes('id="logoutBtn">Log Out</button>'));
const accountScreen=html.slice(html.indexOf('id="accountScreen"'),html.indexOf('</section>',html.indexOf('id="accountScreen"')));
assert.ok(accountScreen.includes('id="logoutBtn">Log Out</button>'));

console.log('Contact security tests: PASS (fixed recipient, authenticated identity, validation, durable queue, RLS)');
