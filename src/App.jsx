import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const isApp = Capacitor.isNativePlatform();
const PUSH = isApp && import.meta.env.VITE_PUSH === '1';
const notify = (body) => sb.functions.invoke('notify', { body }).catch(() => {});
const PTS = { A: 12, 'A-': 11, 'B+': 10, B: 9, 'B-': 8, 'C+': 7, C: 6, 'C-': 5, 'D+': 4, D: 3, 'D-': 2, E: 1 };
const SUBJECTS = {
  Compulsory: ['English', 'Kiswahili', 'Mathematics'],
  Sciences: ['Biology', 'Chemistry', 'Physics'],
  Humanities: ['History and Government', 'Geography', 'CRE', 'IRE', 'HRE'],
  'Technical and applied': ['Home Science', 'Art and Design', 'Agriculture', 'Computer Studies', 'Aviation', 'Woodwork', 'Metalwork', 'Building Construction', 'Power Mechanics', 'Electricity', 'Drawing and Design'],
  'Languages and others': ['French', 'German', 'Arabic', 'Kenya Sign Language', 'Music', 'Business Studies'],
};
const CATS = [['id_front', 'National ID, front'], ['id_back', 'National ID, back'], ['birth', 'Birth certificate'], ['results', 'KCSE results slip'], ['photo', 'Passport photo'], ['admission', 'Admission letter'], ['other', 'Other']];
const CONSENT_UP = 'I agree that Tribridge Cyber may collect, store and process my details and documents only to help me with my applications. I am 18 or older, or my parent or guardian agrees.';
const CONSENT_REQ = 'I consent to Tribridge Cyber handling and processing the details and documents I submit for this request. I confirm the details are true.';
const wa = (p) => 'https://wa.me/' + String(p).replace(/\D/g, '').replace(/^0/, '254');
const priceOf = (r) => (r.mode === 'live' ? r.services?.price_live : r.services?.price_full);
const from = (s) => (s.price_live ? `From KES ${s.price_live}` : s.price_full ? `KES ${s.price_full}` : 'Price soon');

function Logo({ size = 40 }) {
  return (
    <svg width={size} height={Math.round(size * 0.84)} viewBox="0 0 120 100" role="img" aria-label="Tribridge Cyber logo">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2ec4b6" />
          <stop offset="1" stopColor="#e7c38a" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#glow)">
        <g fill="none" stroke="url(#lg)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 84V58L24 42L40 58V84" />
          <path d="M40 84V46L60 22L80 46V84" />
          <path d="M80 84V58L96 42L112 58V84" />
        </g>
        <circle cx="60" cy="9" r="5.5" fill="#e7c38a" />
        <circle cx="24" cy="28" r="4.5" fill="#d98873" />
        <circle cx="96" cy="28" r="4.5" fill="#d98873" />
        <rect x="4" y="88" width="112" height="7" rx="3.5" fill="#2ec4b6" />
      </g>
    </svg>
  );
}
const Word = () => <span className="word">TRIBRIDGE <b>CYBER</b></span>;

function Auth() {
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ username: '', full_name: '', phone: '', email: '', password: '', consent: false });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) {
    e.preventDefault();
    setMsg('');
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) setMsg(error.message);
      return;
    }
    const u = f.username.trim().toLowerCase();
    const { data: free } = await sb.rpc('username_available', { u });
    if (!free) return setMsg('Username already exists. Choose another one.');
    const { data, error } = await sb.auth.signUp({
      email: f.email,
      password: f.password,
      options: { data: { username: u, full_name: f.full_name, phone: f.phone, consent: f.consent } },
    });
    if (error) setMsg(error.message);
    else if (!data.session) setMsg('Account created. Confirm your email, then log in.');
  }
  return (
    <form className="auth" onSubmit={go}>
      <div className="hero"><Logo size={96} /><Word /></div>
      <p className="muted c">From KCSE to your first day on campus.</p>
      {mode === 'up' && (
        <>
          <input placeholder="Username" value={f.username} onChange={set('username')} required />
          <input placeholder="Full name, surname first, as on your ID" value={f.full_name} onChange={set('full_name')} required />
          <input placeholder="Phone (M-Pesa number)" inputMode="tel" value={f.phone} onChange={set('phone')} required />
        </>
      )}
      <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
      <input type="password" placeholder="Password (6+ characters)" minLength={6} value={f.password} onChange={set('password')} required />
      {mode === 'up' && (
        <label className="agree"><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /> {CONSENT_UP}</label>
      )}
      {msg && <p className="err">{msg}</p>}
      <button className="go">{mode === 'in' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
        {mode === 'in' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </form>
  );
}

function Home({ services, news }) {
  const paid = services.filter((s) => !s.free);
  return (
    <>
      <h1>Welcome</h1>
      <section className="fees">
        <h2>Prices</h2>
        <p><b>Free:</b> advice, updates and the cluster points estimate.</p>
        <p className="muted">Choose live help (cheaper, we guide you while you do it yourself) or done for you (we do it for you). Official fees, like the KUCCPS fee, go straight to the agency.</p>
        <ul>
          {paid.map((s) => (
            <li key={s.id}>
              <span>{s.title}</span>
              <span className="px">
                {s.price_live ? `Live KES ${s.price_live}` : ''}
                {s.price_live && s.price_full ? ' | ' : ''}
                {s.price_full ? `Done for you KES ${s.price_full}` : ''}
                {!s.price_live && !s.price_full ? 'Price soon' : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <h2>Updates</h2>
      {news.length === 0 && <p className="muted">No updates yet. New announcements appear here.</p>}
      {news.map((n) => (
        <article key={n.id} className="note">
          <h3>{n.title}</h3>
          <p>{n.body}</p>
          <time>{new Date(n.created_at).toLocaleDateString()}</time>
        </article>
      ))}
    </>
  );
}

function Apply({ s, me, onDone }) {
  const fields = s.fields || [];
  const [mode, setMode] = useState(s.price_live ? 'live' : 'full');
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(([k]) => [k, k === 'phone' ? me.phone : k === 'email' ? me.email || '' : ''])));
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    const { data, error } = await sb.from('requests').insert({ user_id: me.id, service_id: s.id, mode, form, consent_at: new Date().toISOString() }).select('id').single();
    if (error) setErr(error.message);
    else { notify({ kind: 'request', request_id: data.id }); onDone(); }
  }
  return (
    <form className="form" onSubmit={submit}>
      <p>{s.description}</p>
      <div className="modes">
        {s.price_live && (
          <label className={mode === 'live' ? 'on' : ''}>
            <input type="radio" checked={mode === 'live'} onChange={() => setMode('live')} />
            <b>Live help, KES {s.price_live}</b>
            <small>We guide you on a call or chat while you do it yourself.</small>
          </label>
        )}
        {s.price_full && (
          <label className={mode === 'full' ? 'on' : ''}>
            <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} />
            <b>Done for you, KES {s.price_full}</b>
            <small>You send your details and we do it for you.</small>
          </label>
        )}
      </div>
      <p className="muted">Write your names in the same order as on your ID or birth certificate.</p>
      {fields.map(([k, label, type]) => (
        <label key={k} className="fld">{label}
          <input type={type || 'text'} required={!/optional/i.test(label)} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        </label>
      ))}
      <p className="muted">Upload your documents in the Files tab.</p>
      <label className="agree"><input type="checkbox" required checked={ok} onChange={(e) => setOk(e.target.checked)} /> {CONSENT_REQ}</label>
      {err && <p className="err">{err}</p>}
      <button className="go">Apply</button>
    </form>
  );
}

function Services({ services, me }) {
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState('');
  return (
    <>
      <h1>Apply</h1>
      {done && <p className="toast">{done}</p>}
      <div className="grid">
        {services.filter((s) => !s.free).map((s) => (
          <div key={s.id} className={'arch' + (open === s.id ? ' on' : '')}>
            <button onClick={() => setOpen(open === s.id ? null : s.id)}>
              <b>{s.title}</b>
              <small>{from(s)}</small>
            </button>
            {open === s.id && <Apply s={s} me={me} onDone={() => { setOpen(null); setDone('Application sent. Follow it under My requests.'); }} />}
          </div>
        ))}
      </div>
      <MyRequests me={me} />
    </>
  );
}

function Thread({ id }) {
  const [ms, setMs] = useState([]);
  const [t, setT] = useState('');
  const [uid, setUid] = useState('');
  const load = () => sb.from('messages').select('*').eq('request_id', id).order('created_at').then(({ data }) => setMs(data || []));
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUid(data.user.id));
    load();
    const ch = sb.channel('m' + id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'request_id=eq.' + id }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id]);
  async function send() {
    if (!t.trim()) return;
    await sb.from('messages').insert({ request_id: id, sender_id: uid, body: t.trim() });
    setT('');
  }
  return (
    <div className="thread">
      {ms.map((m) => <p key={m.id} className={m.sender_id === uid ? 'mine' : ''}>{m.body}</p>)}
      <input placeholder="Write a message" value={t} onChange={(e) => setT(e.target.value)} />
      <button className="go" onClick={send}>Send</button>
    </div>
  );
}

function Files({ uid }) {
  const [files, setFiles] = useState([]);
  const [cat, setCat] = useState('id_front');
  const dir = `${uid}/files`;
  const load = () => sb.storage.from('docs').list(dir).then(({ data }) => setFiles((data || []).filter((f) => !f.name.startsWith('.'))));
  useEffect(() => { load(); }, [uid]);
  async function up(e) {
    const f = e.target.files[0];
    if (!f) return;
    await sb.storage.from('docs').upload(`${dir}/${cat}__${Date.now()}-${f.name.replace(/[^\w.]/g, '_')}`, f);
    e.target.value = '';
    load();
  }
  async function open(n) {
    const { data } = await sb.storage.from('docs').createSignedUrl(`${dir}/${n}`, 300);
    if (data) window.open(data.signedUrl, '_blank');
  }
  const label = (n) => {
    const [c, rest] = n.split('__');
    return (CATS.find((x) => x[0] === c)?.[1] || 'Other') + ': ' + (rest || n).replace(/^\d+-/, '');
  };
  return (
    <div>
      <select value={cat} onChange={(e) => setCat(e.target.value)}>
        {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input type="file" accept="image/*,application/pdf" onChange={up} />
      {files.length === 0 && <p className="muted">No files yet.</p>}
      {files.map((f) => <button key={f.name} className="link" onClick={() => open(f.name)}>{label(f.name)}</button>)}
    </div>
  );
}

function MyRequests({ me }) {
  const [rs, setRs] = useState([]);
  const [ps, setPs] = useState([]);
  const [msg, setMsg] = useState('');
  const load = async () => {
    const r = await sb.from('requests').select('*, services(title, price_live, price_full)').eq('user_id', me.id).order('created_at', { ascending: false });
    setRs(r.data || []);
    const p = await sb.from('payments').select('*').eq('user_id', me.id);
    setPs(p.data || []);
  };
  useEffect(() => {
    load();
    const ch = sb.channel('mine').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  async function pay(id) {
    const { data, error } = await sb.functions.invoke('stk-push', { body: { request_id: id } });
    setMsg(error ? 'Payment could not start. Check your phone number and try again.' : data.message);
  }
  return (
    <>
      <h2>My requests</h2>
      {msg && <p className="toast">{msg}</p>}
      {rs.length === 0 && <p className="muted">Nothing yet. Pick a service above and tap Apply.</p>}
      {rs.map((r) => {
        const paid = ps.some((p) => p.request_id === r.id && p.status === 'paid');
        const price = priceOf(r);
        return (
          <article key={r.id} className={'note ' + r.status}>
            <h3>{r.services?.title}</h3>
            <p className="muted">{r.mode === 'live' ? 'Live help' : 'Done for you'}, status: {r.status.replace('_', ' ')}{paid ? ', paid' : ''}</p>
            {!paid && price && (
              <>
                <p className="muted">Pay first, then we start.</p>
                <button className="go" onClick={() => pay(r.id)}>Pay KES {price}</button>
              </>
            )}
            <Thread id={r.id} />
          </article>
        );
      })}
    </>
  );
}

function Calc() {
  const [rows, setRows] = useState(['English', 'Kiswahili', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Geography'].map((name, i) => ({ name, g: 'B', c: i < 4 })));
  const upd = (i, p) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const t = rows.map((r) => PTS[r.g]).sort((a, b) => b - a).slice(0, 7).reduce((a, b) => a + b, 0);
  const cl = rows.filter((r) => r.c);
  const r4 = cl.reduce((a, r) => a + PTS[r.g], 0);
  const C = cl.length === 4 && rows.length >= 7 ? Math.sqrt((r4 / 48) * (t / 84)) * 48 : null;
  return (
    <>
      <h1>Cluster points</h1>
      <p className="muted">Add every subject you sat and its grade. Tick the four subjects your course needs. We use your best seven for the total.</p>
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <select value={r.name} onChange={(e) => upd(i, { name: e.target.value })}>
            {Object.entries(SUBJECTS).map(([grp, list]) => (
              <optgroup key={grp} label={grp}>{list.map((n) => <option key={n}>{n}</option>)}</optgroup>
            ))}
          </select>
          <select value={r.g} onChange={(e) => upd(i, { g: e.target.value })}>
            {Object.keys(PTS).map((g) => <option key={g}>{g}</option>)}
          </select>
          <label><input type="checkbox" checked={r.c} onChange={(e) => upd(i, { c: e.target.checked })} /> Cluster</label>
          <button className="x" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="link" onClick={() => setRows([...rows, { name: 'English', g: 'B', c: false }])}>Add a subject</button>
      <div className="result">
        {C ? <><b>{C.toFixed(3)}</b><span>out of 48, estimate</span></> : <span>Add at least 7 subjects and tick exactly four for the cluster.</span>}
      </div>
      <p className="muted">KUCCPS works out the official weighted points from KNEC data. Check yours in the KUCCPS portal.</p>
    </>
  );
}

function More({ me }) {
  const [m, setM] = useState('');
  const [ok, setOk] = useState('');
  async function send() {
    if (!m.trim()) return;
    const { error } = await sb.from('feedback').insert({ user_id: me.id, message: m.trim() });
    setOk(error ? error.message : 'Thank you. We read every message.');
    if (!error) setM('');
  }
  return (
    <>
      <h1>More</h1>
      <p>{me.full_name}</p>
      <p className="muted">@{me.username}</p>
      <h2>Feedback</h2>
      <textarea placeholder="Tell us what to fix or add" value={m} onChange={(e) => setM(e.target.value)} />
      <button className="go" onClick={send}>Send feedback</button>
      {ok && <p className="toast">{ok}</p>}
      <button className="link" onClick={() => sb.auth.signOut()}>Log out</button>
    </>
  );
}

function Prices({ services, reload }) {
  const [v, setV] = useState({});
  const val = (s, k) => v[s.id]?.[k] ?? s[k] ?? '';
  const set = (s, k, x) => setV({ ...v, [s.id]: { ...v[s.id], [k]: x } });
  async function save(s) {
    const n = (k) => (val(s, k) === '' ? null : Number(val(s, k)));
    await sb.from('services').update({ price_live: n('price_live'), price_full: n('price_full') }).eq('id', s.id);
    reload();
  }
  return (
    <>
      <h2>Prices in KES</h2>
      {services.filter((s) => !s.free).map((s) => (
        <div className="note" key={s.id}>
          <h3>{s.title}</h3>
          <div className="row2">
            <input inputMode="numeric" placeholder="Live help" value={val(s, 'price_live')} onChange={(e) => set(s, 'price_live', e.target.value)} />
            <input inputMode="numeric" placeholder="Done for you" value={val(s, 'price_full')} onChange={(e) => set(s, 'price_full', e.target.value)} />
          </div>
          <button className="go" onClick={() => save(s)}>Save</button>
        </div>
      ))}
    </>
  );
}

function Admin({ services, reload }) {
  const [reqs, setReqs] = useState([]);
  const [fb, setFb] = useState([]);
  const [pays, setPays] = useState([]);
  const [t, setT] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState('');
  const load = async () => {
    const r = await sb.from('requests').select('*, profiles(full_name, phone, username), services(title, fields, price_live, price_full)').order('created_at', { ascending: false });
    setReqs(r.data || []);
    const f = await sb.from('feedback').select('*, profiles(username)').order('created_at', { ascending: false }).limit(30);
    setFb(f.data || []);
    const p = await sb.from('payments').select('*');
    setPays(p.data || []);
  };
  useEffect(() => {
    load();
    const ch = sb.channel('requests').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, () => { load(); navigator.vibrate?.(300); }).on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  const setStatus = async (id, status) => { await sb.from('requests').update({ status }).eq('id', id); load(); };
  async function polish() {
    if (!b.trim()) return;
    setMsg('Polishing...');
    const { data, error } = await sb.functions.invoke('ai-refine', { body: { title: t, body: b } });
    if (error || !data?.text) setMsg('AI polish is not set up yet.');
    else { setB(data.text); setMsg('Polished. Check it, then publish.'); }
  }
  async function publish() {
    if (!t.trim() || !b.trim()) return;
    const { error } = await sb.from('announcements').insert({ title: t.trim(), body: b.trim() });
    setMsg(error ? error.message : 'Published.');
    if (!error) { notify({ kind: 'announcement', title: t.trim(), body: b.trim() }); setT(''); setB(''); }
  }
  return (
    <>
      <h1>Admin</h1>
      <h2>New announcement</h2>
      <input placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} />
      <textarea placeholder="Write the update" value={b} onChange={(e) => setB(e.target.value)} />
      <button className="link" onClick={polish}>Polish with AI</button>
      <button className="go" onClick={publish}>Publish</button>
      {msg && <p className="toast">{msg}</p>}
      <h2>Requests ({reqs.filter((r) => r.status === 'new').length} new)</h2>
      {reqs.map((r) => (
        <article key={r.id} className={'note ' + r.status}>
          <h3>{r.services?.title}</h3>
          <p className="muted">{r.mode === 'live' ? 'Live help' : 'Done for you'}{priceOf(r) ? `, KES ${priceOf(r)}` : ''}</p>
          {pays.filter((p) => p.request_id === r.id && p.status === 'paid').map((p) => <p key={p.id} className="toast">Paid, receipt {p.receipt}</p>)}
          <p>{r.profiles?.full_name} (@{r.profiles?.username})</p>
          {(r.services?.fields || []).map(([k, label]) => (r.form?.[k] ? <p key={k}><span className="muted">{label}: </span>{r.form[k]}</p> : null))}
          {r.consent_at && <p className="muted">Consent given {new Date(r.consent_at).toLocaleDateString()}</p>}
          <a href={wa(r.profiles?.phone)}>Message on WhatsApp</a>
          <details><summary>Student files</summary><Files uid={r.user_id} /></details>
          <Thread id={r.id} />
          <div className="chips">
            {['new', 'in_progress', 'done', 'cancelled'].map((s) => (
              <button key={s} className={r.status === s ? 'on' : ''} onClick={() => setStatus(r.id, s)}>{s.replace('_', ' ')}</button>
            ))}
          </div>
        </article>
      ))}
      <Prices services={services} reload={reload} />
      <h2>Feedback</h2>
      {fb.map((x) => (
        <article key={x.id} className="note"><p>{x.message}</p><p className="muted">@{x.profiles?.username}</p></article>
      ))}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [services, setServices] = useState([]);
  const [news, setNews] = useState([]);
  const [tab, setTab] = useState('home');
  const uid = session?.user?.id;
  const loadServices = () => sb.from('services').select('*').order('sort').then(({ data }) => setServices(data || []));

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) { setMe(null); return; }
    const loadNews = () => sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(30).then(({ data }) => setNews(data || []));
    sb.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setMe(data));
    loadServices();
    loadNews();
    const ch = sb.channel('news').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, loadNews).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid]);

  useEffect(() => {
    if (!PUSH || !uid) return;
    PushNotifications.removeAllListeners().then(() => {
      PushNotifications.addListener('registration', (t) => sb.rpc('save_token', { t: t.value }));
      PushNotifications.requestPermissions().then((p) => { if (p.receive === 'granted') PushNotifications.register(); });
    });
  }, [uid]);

  if (session === undefined) return <div className="boot">Tribridge Cyber</div>;
  if (!session) return <Auth />;
  if (!me) return <div className="boot">Loading</div>;
  const admin = me.role === 'admin' && isApp;
  const tabs = [['home', 'Home'], ['apply', 'Apply'], ['files', 'Files'], ['calc', 'Points'], ['more', 'More'], ...(admin ? [['admin', 'Admin']] : [])];
  return (
    <div className="app">
      <header className="top"><Logo size={36} /><Word /></header>
      <main>
        {tab === 'home' && <Home services={services} news={news} />}
        {tab === 'apply' && <Services services={services} me={me} />}
        {tab === 'files' && (
          <>
            <h1>Files</h1>
            <p className="muted">Upload clear photos or PDFs. Only you and Tribridge Cyber can see them.</p>
            <Files uid={me.id} />
          </>
        )}
        {tab === 'calc' && <Calc />}
        {tab === 'more' && <More me={me} />}
        {tab === 'admin' && admin && <Admin services={services} reload={loadServices} />}
      </main>
      <nav className="island">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
