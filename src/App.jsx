import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const isApp = Capacitor.isNativePlatform();
const PTS = { A: 12, 'A-': 11, 'B+': 10, B: 9, 'B-': 8, 'C+': 7, C: 6, 'C-': 5, 'D+': 4, D: 3, 'D-': 2, E: 1 };
const wa = (p) => 'https://wa.me/' + String(p).replace(/\D/g, '').replace(/^0/, '254');

function Auth() {
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ username: '', full_name: '', phone: '', email: '', password: '' });
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
      options: { data: { username: u, full_name: f.full_name, phone: f.phone } },
    });
    if (error) setMsg(error.message);
    else if (!data.session) setMsg('Account created. Confirm your email, then log in.');
  }
  return (
    <form className="auth" onSubmit={go}>
      <h1>Tribridge Services</h1>
      <p className="muted">From KCSE to your first day on campus.</p>
      {mode === 'up' && (
        <>
          <input placeholder="Username" value={f.username} onChange={set('username')} required />
          <input placeholder="Full name" value={f.full_name} onChange={set('full_name')} required />
          <input placeholder="Phone (M-Pesa number)" inputMode="tel" value={f.phone} onChange={set('phone')} required />
        </>
      )}
      <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
      <input type="password" placeholder="Password (6+ characters)" minLength={6} value={f.password} onChange={set('password')} required />
      {msg && <p className="err">{msg}</p>}
      <button className="go">{mode === 'in' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
        {mode === 'in' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </form>
  );
}

function Home({ services, news }) {
  const free = services.filter((s) => s.free);
  const paid = services.filter((s) => !s.free);
  return (
    <>
      <h1>Tribridge Services</h1>
      <section className="fees">
        <h2>What is free and what is paid</h2>
        <p><b>Free:</b> {free.map((s) => s.title).join(', ')}, and the cluster points estimate.</p>
        <p>Paid services cover our time, never the document itself. Official fees, like the KUCCPS fee, go straight to the agency.</p>
        <ul>
          {paid.map((s) => (
            <li key={s.id}><span>{s.title}</span><b>{s.price ? `KES ${s.price}` : 'Quoted first'}</b></li>
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

function Services({ services, me }) {
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  async function apply(s) {
    const { error } = await sb.from('requests').insert({ user_id: me.id, service_id: s.id, details: note });
    setDone(error ? error.message : `Application sent. We will contact you on ${me.phone}.`);
    if (!error) { setOpen(null); setNote(''); }
  }
  return (
    <>
      <h1>Services</h1>
      {done && <p className="toast">{done}</p>}
      <div className="grid">
        {services.filter((s) => !s.free).map((s) => (
          <div key={s.id} className={'arch' + (open === s.id ? ' on' : '')}>
            <button onClick={() => setOpen(open === s.id ? null : s.id)}>
              <b>{s.title}</b>
              <small>{s.price ? `KES ${s.price}` : 'Fee quoted first'}</small>
            </button>
            {open === s.id && (
              <div className="form">
                <p>{s.description}</p>
                <textarea placeholder="Anything we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="go" onClick={() => apply(s)}>Apply</button>
              </div>
            )}
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

function Docs({ req }) {
  const [files, setFiles] = useState([]);
  const dir = `${req.user_id}/${req.id}`;
  const load = () => sb.storage.from('docs').list(dir).then(({ data }) => setFiles((data || []).filter((f) => !f.name.startsWith('.'))));
  useEffect(() => { load(); }, []);
  async function up(e) {
    const f = e.target.files[0];
    if (!f) return;
    await sb.storage.from('docs').upload(`${dir}/${Date.now()}-${f.name.replace(/[^\w.]/g, '_')}`, f);
    load();
  }
  async function open(n) {
    const { data } = await sb.storage.from('docs').createSignedUrl(`${dir}/${n}`, 300);
    if (data) window.open(data.signedUrl, '_blank');
  }
  return (
    <div>
      <p className="muted">Upload a document (ID, birth certificate, results slip)</p>
      <input type="file" accept="image/*,application/pdf" onChange={up} />
      {files.map((f) => <button key={f.name} className="link" onClick={() => open(f.name)}>{f.name.replace(/^\d+-/, '')}</button>)}
    </div>
  );
}

function MyRequests({ me }) {
  const [rs, setRs] = useState([]);
  const [ps, setPs] = useState([]);
  const [msg, setMsg] = useState('');
  const load = async () => {
    const r = await sb.from('requests').select('*, services(title, price)').eq('user_id', me.id).order('created_at', { ascending: false });
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
        return (
          <article key={r.id} className={'note ' + r.status}>
            <h3>{r.services?.title}</h3>
            <p className="muted">Status: {r.status.replace('_', ' ')}{paid ? ', paid' : ''}</p>
            {!paid && r.services?.price && (
              <>
                <p className="muted">Pay first, then we start.</p>
                <button className="go" onClick={() => pay(r.id)}>Pay KES {r.services.price}</button>
              </>
            )}
            <Docs req={r} />
            <Thread id={r.id} />
          </article>
        );
      })}
    </>
  );
}

function Calc() {
  const names = ['English', 'Kiswahili', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Geography'];
  const [rows, setRows] = useState(names.map((name, i) => ({ name, g: 'B', c: i < 4 })));
  const upd = (i, p) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const t = rows.reduce((a, r) => a + PTS[r.g], 0);
  const cl = rows.filter((r) => r.c);
  const r4 = cl.reduce((a, r) => a + PTS[r.g], 0);
  const C = cl.length === 4 ? Math.sqrt((r4 / 48) * (t / 84)) * 48 : null;
  return (
    <>
      <h1>Cluster points</h1>
      <p className="muted">Enter your best seven subjects and tick the four your course needs.</p>
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <select value={r.g} onChange={(e) => upd(i, { g: e.target.value })}>
            {Object.keys(PTS).map((g) => <option key={g}>{g}</option>)}
          </select>
          <label><input type="checkbox" checked={r.c} onChange={(e) => upd(i, { c: e.target.checked })} /> Cluster</label>
        </div>
      ))}
      <div className="result">
        {C ? <><b>{C.toFixed(3)}</b><span>out of 48, estimate</span></> : <span>Tick exactly four cluster subjects.</span>}
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

function Admin() {
  const [reqs, setReqs] = useState([]);
  const [fb, setFb] = useState([]);
  const [pays, setPays] = useState([]);
  const [t, setT] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState('');
  const load = async () => {
    const r = await sb.from('requests').select('*, profiles(full_name, phone, username), services(title)').order('created_at', { ascending: false });
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
  async function publish() {
    if (!t.trim() || !b.trim()) return;
    const { error } = await sb.from('announcements').insert({ title: t.trim(), body: b.trim() });
    setMsg(error ? error.message : 'Published.');
    if (!error) { setT(''); setB(''); }
  }
  return (
    <>
      <h1>Admin</h1>
      <h2>New announcement</h2>
      <input placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} />
      <textarea placeholder="Write the update" value={b} onChange={(e) => setB(e.target.value)} />
      <button className="go" onClick={publish}>Publish</button>
      {msg && <p className="toast">{msg}</p>}
      <h2>Requests ({reqs.filter((r) => r.status === 'new').length} new)</h2>
      {reqs.map((r) => (
        <article key={r.id} className={'note ' + r.status}>
          <h3>{r.services?.title}</h3>
          {pays.filter((p) => p.request_id === r.id && p.status === 'paid').map((p) => <p key={p.id} className="toast">Paid, receipt {p.receipt}</p>)}
          <p>{r.profiles?.full_name} (@{r.profiles?.username})</p>
          {r.details && <p className="muted">{r.details}</p>}
          <a href={wa(r.profiles?.phone)}>Message on WhatsApp</a>
          <Docs req={r} />
          <Thread id={r.id} />
          <div className="chips">
            {['new', 'in_progress', 'done', 'cancelled'].map((s) => (
              <button key={s} className={r.status === s ? 'on' : ''} onClick={() => setStatus(r.id, s)}>{s.replace('_', ' ')}</button>
            ))}
          </div>
        </article>
      ))}
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

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) { setMe(null); return; }
    const loadNews = () => sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(30).then(({ data }) => setNews(data || []));
    sb.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setMe(data));
    sb.from('services').select('*').order('sort').then(({ data }) => setServices(data || []));
    loadNews();
    const ch = sb.channel('news').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, loadNews).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid]);

  if (session === undefined) return <div className="boot">Tribridge</div>;
  if (!session) return <Auth />;
  if (!me) return <div className="boot">Loading</div>;
  const admin = me.role === 'admin' && isApp;
  const tabs = [['home', 'Home'], ['services', 'Services'], ['calc', 'Points'], ['more', 'More'], ...(admin ? [['admin', 'Admin']] : [])];
  return (
    <div className="app">
      <main>
        {tab === 'home' && <Home services={services} news={news} />}
        {tab === 'services' && <Services services={services} me={me} />}
        {tab === 'calc' && <Calc />}
        {tab === 'more' && <More me={me} />}
        {tab === 'admin' && admin && <Admin />}
      </main>
      <nav className="island">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
