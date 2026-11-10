import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const isApp = Capacitor.isNativePlatform();
const PUSH = isApp && import.meta.env.VITE_PUSH === '1';
const notify = (body) => sb.functions.invoke('notify', { body }).catch(() => {});
const CATS = [['id_front', 'National ID, front'], ['id_back', 'National ID, back'], ['birth', 'Birth certificate'], ['results', 'KCSE results slip'], ['photo', 'Passport photo'], ['admission', 'Admission letter'], ['other', 'Other']];
const CONSENT = 'I consent to Tribridge Cyber handling and processing the details and documents I give, only to help me with my applications. I confirm the details are true. I am 18 or older, or my parent or guardian agrees.';
const AWARE = 'I have read the Privacy Policy and I am aware of how Tribridge Cyber handles my data.';
const APK_URL = import.meta.env.VITE_APK_URL || '';
const COUNTIES = ['Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita Taveta', 'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga', "Murang'a", 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi'];
const QKEY = 'tb_queue';
const getQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } };
const setQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { /* storage unavailable */ } };
async function flushQueue() {
  const q = getQ();
  if (!q.length || !navigator.onLine) return 0;
  const left = [];
  let sent = 0;
  for (const item of q) {
    const { data, error } = await sb.from('requests').insert(item).select('id').single();
    if (error) { if (/fetch|network/i.test(error.message)) left.push(item); } else { sent++; notify({ kind: 'request', request_id: data.id }); }
  }
  setQ(left);
  return sent;
}
const wa = (p) => 'https://wa.me/' + String(p).replace(/\D/g, '').replace(/^0/, '254');
const priceOf = (r) => (r.mode === 'live' ? r.services?.price_live : r.services?.price_full);
const ds = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function reportHtml(me, sum, courses, when) {
  const rows = courses.map((c) => `<tr><td>${esc(c.programme)}</td><td>${esc(c.institution)}</td><td>${c.cutoff}</td><td>${c.score}</td><td>${c.diff >= 0 ? 'Likely' : 'Borderline'}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Course analysis</title><style>body{font-family:Arial,sans-serif;margin:20px;color:#0b1b26}h1{margin:0;color:#007c8a}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #cfd8dc;padding:6px;text-align:left}th{background:#e0f7fa}.m{color:#546e7a}</style></head><body><h1>Tribridge Cyber</h1><p class="m">Course analysis for ${esc(me.full_name)}${sum.index_no ? ', index number ' + esc(sum.index_no) : ''}, ${new Date(when).toLocaleDateString('en-GB')}</p><p>Best seven subjects: <b>${sum.total} of 84</b>.${sum.cluster ? ` Cluster points: about <b>${sum.cluster}</b> of 48 (estimate).` : ''}</p><p><b>Grades:</b> ${sum.grades.map((g) => esc(g.name) + ' ' + esc(g.g)).join(', ')}</p><h3>Courses you may qualify for</h3><table><tr><th>Course</th><th>University</th><th>Cut-off</th><th>Your estimate</th><th>Chance</th></tr>${rows}</table><p class="m">Estimates use the last published KUCCPS cut-off points and an approximate cluster formula. KUCCPS works out your official weighted cluster points in its portal. Placement is not guaranteed.</p></body></html>`;
}
async function saveFile(name, text) {
  if (isApp) {
    const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: r.uri, dialogTitle: 'Save or share your results' });
  } else {
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
    el.download = name;
    el.click();
  }
}
const PTS = { A: 12, 'A-': 11, 'B+': 10, B: 9, 'B-': 8, 'C+': 7, C: 6, 'C-': 5, 'D+': 4, D: 3, 'D-': 2, E: 1 };
const SUBJECTS = {
  Compulsory: ['English', 'Kiswahili', 'Mathematics'],
  Sciences: ['Biology', 'Chemistry', 'Physics', 'General Science', 'Biological Sciences', 'Physical Sciences'],
  Humanities: ['History and Government', 'Geography', 'CRE', 'IRE', 'HRE', 'Social Education and Ethics'],
  'Technical and applied': ['Home Science', 'Art and Design', 'Agriculture', 'Computer Studies', 'Aviation', 'Woodwork', 'Metalwork', 'Building Construction', 'Power Mechanics', 'Electricity', 'Drawing and Design'],
  'Languages and others': ['French', 'German', 'Arabic', 'Kenya Sign Language', 'Music', 'Business Studies', 'Accounting', 'Commerce'],
};
const norm = (s) => String(s).trim().toLowerCase();
function score(p, pts, t) {
  const slots = String(p.req).split(';').map((s) => {
    const [o, g] = s.split(':');
    return { opts: o.split('/').map(norm), min: PTS[(g || '').trim()] || 0 };
  }).sort((x, y) => (x.opts.includes('*') ? 99 : x.opts.length) - (y.opts.includes('*') ? 99 : y.opts.length));
  const used = new Set();
  let r = 0;
  for (const s of slots) {
    let bi = -1;
    pts.forEach((g, i) => { if (!used.has(i) && g.pts >= s.min && (s.opts.includes('*') || s.opts.includes(norm(g.name))) && (bi < 0 || g.pts > pts[bi].pts)) bi = i; });
    if (bi < 0) return null;
    used.add(bi);
    r += pts[bi].pts;
  }
  return Math.sqrt((r / 48) * (t / 84)) * 48;
}
const IC = {
  home: 'M3 11l9-8 9 8|M5 10v10h5v-6h4v6h5V10', book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z|M4 19V5|M19 17H6', grid: 'M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0', menu: 'M4 6h16M4 12h16M4 18h16', x: 'M6 6l12 12M18 6L6 18',
  ok: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z|M8 12l3 3 5-6', calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z|M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10 21a2 2 0 0 0 4 0', chat: 'M4 5h16v11H9l-5 4z', out: 'M9 4H5v16h4|M16 8l4 4-4 4|M20 12H9', login: 'M15 4h4v16h-4|M10 8l4 4-4 4|M14 12H4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', id: 'M3 6h18v12H3z|M7 10h4v4H7z|M14 10h4M14 14h4', bank: 'M3 9l9-5 9 5|M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18',
  doc: 'M6 3h9l4 4v14H6z|M14 3v5h5M9 13h6M9 17h6', wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M3 7l2-3h12M16 14h2', heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z', cap: 'M2 9l10-5 10 5-10 5z|M6 11v5c3 2.5 9 2.5 12 0v-5',
};
function Ic({ n, s = 22 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(IC[n] || IC.grid).split('|').map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
const GUIDE = [
  { t: 'Apply for your National ID', ic: 'id', when: 'Right after exams (once you are 18)', d: 'Your ID unlocks everything else: KRA PIN, bank account, HEF, SIM registration and jobs.', need: ['Birth certificate', 'Parent ID copies', 'School leaving letter or KCSE index number'], help: 'Fingerprints are taken in person at your local registration office, so we guide you on what to carry and where to go. Free.' },
  { t: 'Create your eCitizen account', ic: 'bank', when: 'Once you have your ID', d: 'The government portal for Good Conduct, passports, SHA and more.', need: ['ID number', 'Phone number', 'Email address'], help: 'We set it up and verify it for you online.', svc: 1 },
  { t: 'Get your KRA PIN', ic: 'doc', when: 'Once you have your ID', d: 'Required for HEF, bank accounts, jobs and business.', need: ['ID number', 'Email address', 'Phone number'], help: 'We register you on iTax and send you the PIN certificate.', svc: 1 },
  { t: 'Open a bank or M-Pesa account', ic: 'wallet', when: 'Once you have your ID', d: 'HEF loans and scholarships are paid into your own account.', need: ['ID', 'KRA PIN (most banks)', 'Passport photo'], help: 'We advise on student-friendly accounts and what to carry. Free.' },
  { t: 'Register for SHA', ic: 'heart', when: 'Anytime', d: 'National health cover through the Social Health Authority. Universities ask for proof when you report.', need: ['ID number', 'Phone number'], help: 'We register you online.', svc: 1 },
  { t: 'Check your KCSE results', ic: 'list', when: 'Usually January', d: 'Results come out through the KNEC SMS service and portal.', need: ['KCSE index number'], help: 'We alert you the moment results are out and explain your next steps. Free.' },
  { t: 'Know your cluster points', ic: 'calc', when: 'After results', d: 'Cluster points decide which degree courses you qualify for at each university.', need: ['Your subject grades or a photo of your results slip'], help: 'Our course analyzer calculates them and lists courses you qualify for.', svc: 1 },
  { t: 'Apply through KUCCPS', ic: 'cap', when: 'Opens after results (April to May this year)', d: 'Choose university and TVET courses on the KUCCPS student portal. KMTC has its own windows.', need: ['KCSE index number and year', 'Birth certificate number', 'Email and phone'], help: 'We help pick smart choices and submit them for you, plus revisions.', svc: 1 },
  { t: 'Apply for HEF funding', ic: 'book', when: 'After placement', d: 'Government scholarships and HELB loans for university and TVET, applied for on the HEF portal.', need: ['ID', 'KRA PIN', 'Admission letter', 'Parent details'], help: 'We fill in and submit your application.', svc: 1 },
  { t: 'Certificate of Good Conduct', ic: 'shield', when: 'When needed for jobs or travel', d: 'Applied for on eCitizen; fingerprints taken at a DCI office.', need: ['ID', 'eCitizen account', 'Government fee'], help: 'We apply and book your appointment.', svc: 1 },
  { t: 'Other paths', ic: 'grid', when: 'Ongoing', d: 'KMTC, teacher training, TVET colleges, driving school and short courses are great options too.', need: ['KCSE results'], help: 'Free advice on every path, and we can apply to colleges for you.', svc: 1 },
];

function Logo({ size = 40 }) {
  return (
    <svg width={size} height={Math.round(size * 0.84)} viewBox="0 0 120 100" role="img" aria-label="Tribridge Cyber logo">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00e5ff" /><stop offset="1" stopColor="#e7c38a" /></linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g filter="url(#glow)">
        <g fill="none" stroke="url(#lg)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 84V58L24 42L40 58V84" /><path d="M40 84V46L60 22L80 46V84" /><path d="M80 84V58L96 42L112 58V84" />
        </g>
        <circle cx="60" cy="9" r="5.5" fill="#e7c38a" /><circle cx="24" cy="28" r="4.5" fill="#d98873" /><circle cx="96" cy="28" r="4.5" fill="#d98873" />
        <rect x="4" y="88" width="112" height="7" rx="3.5" fill="#00e5ff" />
      </g>
    </svg>
  );
}
const Brand = () => (
  <div className="brand"><div className="tile"><Logo size={34} /></div><div className="wm"><b>TRIBRIDGE</b><span>CYBER</span></div></div>
);
const Status = ({ s }) => <span className={'chipst ' + s}>{s.replace('_', ' ')}</span>;
function Toggle({ label, children }) {
  const [o, setO] = useState(false);
  return (<div><button className="link" onClick={() => setO(!o)}>{o ? 'Hide ' : ''}{label}</button>{o && children}</div>);
}
function FreePaid() {
  return (
    <>
      <div className="card free">
        <div className="ttl"><Ic n="ok" /><h3>Always free</h3></div>
        <ul className="list"><li>Career and course advice</li><li>KUCCPS, HEF and college opening alerts</li><li>KCSE results updates</li><li>ID and bank account guidance</li></ul>
      </div>
      <div className="card paid">
        <h3>Paid only when we do it for you</h3>
        <p>We only charge a small service fee when we fill in and submit an application on your behalf, like a cyber but online: KUCCPS, KRA PIN, HEF, eCitizen, SHA, Good Conduct, college applications, CVs and the course analyzer. Government fees, if any, are separate. You see the price before you apply.</p>
      </div>
    </>
  );
}
function Footer({ go }) {
  return (
    <footer className="f"><Brand /><p className="lead">Your bridge from KCSE to your career.</p>
      <p className="note">All services are offered online. We never ask you to meet in person.</p>
      <button className="link" onClick={() => go('privacy')}>Privacy Policy</button></footer>
  );
}

function Home({ go, me }) {
  return (
    <>
      <section className="hero">
        <span className="badge">KCSE class of 2026</span>
        <h1>Done with KCSE? <em>We bridge you</em> to what comes next.</h1>
        <p className="lead">ID, KRA PIN, KUCCPS, HEF, cluster points and more. Tribridge Cyber guides Form 4 leavers step by step, all online.</p>
        <div className="stack">
          {!me && <button className="cta" onClick={() => go('auth')}><Ic n="login" /> Create free account</button>}
          <button className="ghost" onClick={() => go('guide')}>See the steps after KCSE</button>
        </div>
        <div className="card">
          <p className="road">// your roadmap</p>
          {GUIDE.slice(0, 6).map((s, i) => (
            <div className="rm" key={s.t}><i>{String(i + 1).padStart(2, '0')}</i><div><b>{s.t}</b><div className="note">{s.when}</div></div></div>
          ))}
          <button className="link" onClick={() => go('guide')}>View all {GUIDE.length} steps →</button>
        </div>
      </section>
      {!isApp && (
        <div className="card paid">
          <h3>Get the Android app</h3>
          <p className="muted">Faster, and it tells you when your request moves. Download the app, then allow installs from this source when your phone asks.</p>
          {APK_URL ? <a className="cta sm" href={APK_URL}>Download the app</a> : <span className="tag">Download link coming soon</span>}
        </div>
      )}
      <h2>What is free and what is paid</h2>
      <p className="lead">Before anything else, here is exactly how we work.</p>
      <FreePaid />
      <button className="link" onClick={() => go('services')}>See full price list →</button>
      <div className="card"><Ic n="cap" s={30} /><h3>KUCCPS made simple</h3><p className="muted">We pick and submit smart course choices with you.</p></div>
      <div className="card"><Ic n="calc" s={30} /><h3>Course analyzer</h3><p className="muted">Know your cluster points and where you qualify.</p></div>
      <div className="card"><Ic n="shield" s={30} /><h3>Honest pricing</h3><p className="muted">Advice is free. Pay only when we apply for you.</p></div>
      <Footer go={go} />
    </>
  );
}

function Guide({ go }) {
  return (
    <>
      <p className="eyebrow">Post-KCSE guide</p>
      <h1>Your steps after KCSE</h1>
      <p className="lead">Follow these in order. Most need your National ID, so start there.</p>
      <div className="tl">
        {GUIDE.map((s, i) => (
          <div className="step" key={s.t}>
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <div className="card">
              <h3 className="ttl"><Ic n={s.ic} /> {s.t}</h3>
              <div className="right-tag"><span className="tag">{s.when}</span></div>
              <p className="muted">{s.d}</p>
              <p className="micro">You need</p>
              <ul className="list">{s.need.map((x) => <li key={x}><Ic n="ok" s={20} />{x}</li>)}</ul>
              <p className="micro">How we help</p>
              <p>{s.help}</p>
              {s.svc && <button className="ghost" onClick={() => go('services')}>View price</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Services({ services, me, go, onApply }) {
  const paid = services.filter((s) => !s.free);
  const free = services.filter((s) => s.free);
  return (
    <>
      <p className="eyebrow">Services and prices</p>
      <h1>Everything we can help with</h1>
      <p className="lead">Prices are service fees only. Government fees, if any, are separate.</p>
      {me && <button className="ghost" onClick={() => go('requests')}>My requests</button>}
      <FreePaid />
      <h2>Paid services (we apply for you)</h2>
      {paid.map((s) => (
        <div className="card" key={s.id}>
          <div className="row"><h3>{s.title}</h3><span className="px">{s.price_full || s.price_live ? `KES ${s.price_full || s.price_live}` : 'Soon'}</span></div>
          <p className="muted">{s.description}</p>
          {s.note && <p className="note">Note: {s.note}</p>}
          {s.price_live && s.price_full && <p className="note">Or live help, where we guide you while you do it: KES {s.price_live}</p>}
          {s.soon ? <span className="tag">Opening soon</span> : s.id === 'analyzer' ? <button className="cta sm" onClick={() => go('analyzer')}>Open</button> : <button className="cta sm" onClick={() => onApply(s)}>Apply</button>}
        </div>
      ))}
      <h2>Free help</h2>
      {free.map((s) => (
        <div className="card" key={s.id}><div className="row"><h3>{s.title}</h3><span className="tag free">FREE</span></div><p className="muted">{s.description}</p></div>
      ))}
    </>
  );
}

function Apply({ s, me, prefill, onClose, onDone }) {
  const fields = s.fields || [];
  const [mode, setMode] = useState(s.price_live ? 'live' : 'full');
  const [form, setForm] = useState(() => ({ ...Object.fromEntries(fields.map(([k]) => [k, k === 'phone' ? me.phone : k === 'email' ? me.email || '' : ''])), ...(prefill || {}) }));
  const [ok, setOk] = useState(false);
  const [aw, setAw] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(form).filter(([k]) => !k.startsWith('_')));
    const payload = { user_id: me.id, service_id: s.id, mode, form: clean, consent_at: new Date().toISOString() };
    if (!navigator.onLine) { setQ([...getQ(), payload]); onDone(true); return; }
    const { data, error } = await sb.from('requests').insert(payload).select('id').single();
    if (error) {
      if (/fetch|network/i.test(error.message)) { setQ([...getQ(), payload]); onDone(true); return; }
      setErr(error.message);
    } else { notify({ kind: 'request', request_id: data.id }); onDone(); }
  }
  return (
    <div className="sheet">
      <div className="row"><p className="eyebrow">Apply</p><button className="link" onClick={onClose}><Ic n="x" /></button></div>
      <h1>{s.title}</h1>
      <p className="muted">{s.description}</p>
      <form onSubmit={submit}>
        <div className="modes">
          {s.price_live && (<label className={mode === 'live' ? 'on' : ''}><input type="radio" checked={mode === 'live'} onChange={() => setMode('live')} /><b>Live help, KES {s.price_live}</b><small>We guide you on a call or chat while you do it yourself.</small></label>)}
          {s.price_full && (<label className={mode === 'full' ? 'on' : ''}><input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} /><b>Done for you, KES {s.price_full}</b><small>You send your details and we do it for you.</small></label>)}
        </div>
        <p className="muted">Write your names in the same order as on your ID or birth certificate.</p>
        {fields.map(([k, label, type, opts]) => {
          if (type === 'h') return <h3 key={k} className="sec">{label}</h3>;
          if (type === 'info') return <p key={k} className="note">{label}</p>;
          const req = !/optional/i.test(label);
          const val = form[k] ?? '';
          const set = (v) => setForm({ ...form, [k]: v });
          return (
            <label key={k} className="fld">{label}
              {type === 'county' || type === 'select' ? (
                <select required={req} value={val} onChange={(e) => set(e.target.value)}>
                  <option value="">Choose</option>
                  {(type === 'county' ? COUNTIES : opts || []).map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : type === 'textarea' ? (
                <textarea required={req} value={val} onChange={(e) => set(e.target.value)} />
              ) : (
                <input type={type || 'text'} required={req} value={val} onChange={(e) => set(e.target.value)} />
              )}
            </label>
          );
        })}
        <p className="muted">Upload your documents under My account.</p>
        <label className="agree"><input type="checkbox" required checked={aw} onChange={(e) => setAw(e.target.checked)} /> {AWARE}</label>
        <label className="agree"><input type="checkbox" required checked={ok} onChange={(e) => setOk(e.target.checked)} /> {CONSENT}</label>
        {err && <p className="err">{err}</p>}
        <button className="cta full">Apply</button>
      </form>
    </div>
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
      {ms.map((m) => <p key={m.id} className={m.bot ? 'bot' : m.sender_id === uid ? 'mine' : ''}>{m.bot && <b>Tribridge Bot: </b>}{m.body}</p>)}
      <input placeholder="Write a message" value={t} onChange={(e) => setT(e.target.value)} />
      <button className="cta sm" onClick={send}>Send</button>
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
  const label = (n) => { const [c, rest] = n.split('__'); return (CATS.find((x) => x[0] === c)?.[1] || 'Other') + ': ' + (rest || n).replace(/^\d+-/, ''); };
  return (
    <div>
      <select value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input type="file" accept="image/*,application/pdf" onChange={up} />
      {files.length === 0 && <p className="muted">No files yet.</p>}
      {files.map((f) => <button key={f.name} className="link" onClick={() => open(f.name)}>{label(f.name)}</button>)}
    </div>
  );
}

function PayBox({ r, price, instr, onSent }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  async function send() {
    if (!/^[A-Za-z0-9]{10}$/.test(code.trim())) return setMsg('The M-Pesa code has 10 letters and numbers. Copy it from your M-Pesa SMS.');
    const { error } = await sb.rpc('submit_payment', { rid: r.id, code });
    if (error) return setMsg(error.message.includes('duplicate') ? 'That code was already used.' : 'Could not send. Check the code and try again.');
    notify({ kind: 'payment', request_id: r.id });
    setCode('');
    onSent();
  }
  return (
    <div>
      <p className="note">Pay first, then we start. Send KES {price} by M-Pesa:</p>
      <p className="toast">{instr}</p>
      <input placeholder="M-Pesa code, for example SJK4ABC123" value={code} onChange={(e) => setCode(e.target.value)} />
      {msg && <p className="err">{msg}</p>}
      <button className="cta sm" onClick={send}>I have paid</button>
    </div>
  );
}

function Requests({ me }) {
  const [rs, setRs] = useState([]);
  const [ps, setPs] = useState([]);
  const [instr, setInstr] = useState('');
  const load = async () => {
    const r = await sb.from('requests').select('*, services(title, price_live, price_full)').eq('user_id', me.id).order('created_at');
    setRs(r.data || []);
    const p = await sb.from('payments').select('*').eq('user_id', me.id).order('created_at');
    setPs(p.data || []);
  };
  useEffect(() => {
    load();
    sb.from('settings').select('value').eq('key', 'pay_instructions').maybeSingle().then(({ data }) => setInstr(data?.value || 'Payment details will be shown here soon.'));
    const ch = sb.channel('mine').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  return (
    <>
      <p className="eyebrow">My requests</p>
      <h1>Track your applications</h1>
      <p className="lead">See payment and progress for every service you requested.</p>
      {rs.length === 0 && <p className="muted">Nothing yet. Open Services and tap Apply.</p>}
      {rs.map((r) => {
        const mine = ps.filter((p) => p.request_id === r.id);
        const paid = mine.some((p) => p.status === 'paid');
        const wait = mine.find((p) => p.status === 'pending');
        const bad = mine.some((p) => p.status === 'failed');
        const price = priceOf(r);
        return (
          <div className="card" key={r.id}>
            <div className="row"><h3>{r.services?.title}</h3><Status s={r.status} /></div>
            <p className="note">{r.mode === 'live' ? 'Live help' : 'Done for you'}, applied {ds(r.created_at)}</p>
            {paid ? <p className="toast">Paid. Thank you.</p> : wait ? <p className="toast">Payment sent (code {wait.receipt}). {wait.note || 'Waiting for approval.'}</p> : price ? (
              <>{bad && <p className="err">Your last payment was not approved. Check the code and try again.</p>}<PayBox r={r} price={price} instr={instr} onSent={load} /></>
            ) : <p className="note">We will confirm the fee with you.</p>}
            <Toggle label="Messages"><Thread id={r.id} /></Toggle>
          </div>
        );
      })}
    </>
  );
}

function CalcPay({ price, instr, claims, onSent }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const wait = claims.find((c) => c.status === 'pending');
  async function send() {
    if (!/^[A-Za-z0-9]{10}$/.test(code.trim())) return setMsg('The M-Pesa code has 10 letters and numbers. Copy it from your M-Pesa SMS.');
    const { error } = await sb.rpc('submit_calc_payment', { code });
    if (error) return setMsg(error.message.includes('duplicate') ? 'That code was already used.' : 'Could not send. Check the code and try again.');
    notify({ kind: 'calc' });
    setCode('');
    onSent();
  }
  if (wait) return <p className="toast">Payment sent (code {wait.receipt}). {wait.note || 'Waiting for approval.'}</p>;
  return (
    <div>
      {claims.some((c) => c.status === 'failed') && <p className="err">Your last payment was not approved. Check the code and try again.</p>}
      <p className="note">Send KES {price} by M-Pesa:</p>
      <p className="toast">{instr}</p>
      <input placeholder="M-Pesa code, for example SJK4ABC123" value={code} onChange={(e) => setCode(e.target.value)} />
      {msg && <p className="err">{msg}</p>}
      <button className="cta sm" onClick={send}>I have paid</button>
    </div>
  );
}

function Analyzer({ me, reload, services, onApply }) {
  const isAdmin = me.role === 'admin';
  const credits = me.calc_credits || 0;
  const can = isAdmin || credits > 0;
  const svc = services.find((s) => s.id === 'analyzer');
  const kuccps = services.find((s) => s.id === 'kuccps');
  const [instr, setInstr] = useState('');
  const [claims, setClaims] = useState([]);
  const [saved, setSaved] = useState([]);
  const [rows, setRows] = useState(['English', 'Kiswahili', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Geography'].map((name, i) => ({ name, g: 'B', c: i < 4 })));
  const [idx, setIdx] = useState('');
  const [sure, setSure] = useState(false);
  const [res, setRes] = useState(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [flt, setFlt] = useState('likely');
  const [order, setOrder] = useState('best');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const [lim, setLim] = useState(40);
  const loadClaims = () => sb.from('payments').select('*').eq('user_id', me.id).eq('purpose', 'calculator').then(({ data }) => setClaims(data || []));
  const loadSaved = () => sb.from('calc_results').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).then(({ data }) => setSaved(data || []));
  useEffect(() => {
    reload();
    loadClaims();
    loadSaved();
    sb.from('settings').select('value').eq('key', 'pay_instructions').maybeSingle().then(({ data }) => setInstr(data?.value || 'Payment details will be shown here soon.'));
    const ch = sb.channel('calc').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { loadClaims(); reload(); }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  useEffect(() => {
    if (!res) return;
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(res.expires_at).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { setRes(null); setMsg('Your results have expired. To run the analyzer again, pay again.'); loadSaved(); }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [res]);
  const upd = (i, p) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const pts = rows.map((r) => PTS[r.g]);
  const t = [...pts].sort((x, y) => y - x).slice(0, 7).reduce((x, y) => x + y, 0);
  const cl = rows.filter((r) => r.c);
  const r4 = cl.reduce((x, r) => x + PTS[r.g], 0);
  const C = cl.length === 4 && rows.length >= 7 ? Math.sqrt((r4 / 48) * (t / 84)) * 48 : null;
  async function find() {
    if (!/^[0-9]{6,12}(\/[0-9]{4})?$/.test(idx.trim())) return setMsg('Type your KCSE index number, for example 12345678/2025.');
    setBusy(true);
    setMsg('');
    const { data, error } = await sb.functions.invoke('analyze', { body: { grades: rows.map((r) => ({ name: r.name, g: r.g, c: r.c })), index_no: idx.trim() } });
    setBusy(false);
    if (error || !data?.ok) return setMsg(data?.error || 'Could not run the analysis. You were not charged. Try again.');
    setRes(data);
    setLim(40);
    setSure(false);
    reload();
    loadSaved();
  }
  const download = (summary, courses, when) => saveFile('Tribridge-course-analysis.html', reportHtml(me, summary, courses, when)).catch(() => setMsg('Could not save the file. Try again.'));
  const progs = res ? res.courses.map((c, i) => ({ id: i, ...c })) : null;
  const list = (progs || [])
    .filter((p) => (flt === 'likely' ? p.diff >= 0 : p.diff >= -2 && p.diff < 0))
    .filter((p) => (p.programme + ' ' + p.institution).toLowerCase().includes(q.toLowerCase()))
    .sort((x, y) => (order === 'best' ? y.cutoff - x.cutoff : y.diff - x.diff));
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <>
      <p className="eyebrow">Course analyzer</p><h1>Cluster points and your courses</h1>
      {msg && <p className="toast">{msg}</p>}
      {!can && !res && (
        <div className="card paid">
          <div className="row"><h3>Unlock one analysis</h3><span className="px">KES {svc?.price_full || 100}</span></div>
          <p className="note">{svc?.description} One payment gives one analysis for one student and one KCSE index number. You must download your results within 30 minutes, or they disappear and you pay again.</p>
          <CalcPay price={svc?.price_full || 100} instr={instr} claims={claims} onSent={loadClaims} />
        </div>
      )}
      {can && !res && (
        <>
          <p className="muted">Add every subject you sat and its grade. Tick the four subjects for the cluster. We use your best seven for the total.</p>
          <p className="note">{isAdmin ? 'Admin: unlimited use.' : `Analyses left: ${credits}. One payment gives one analysis for one KCSE index number.`}</p>
          {rows.map((r, i) => (
            <div className="grade" key={i}>
              <select value={r.name} onChange={(e) => upd(i, { name: e.target.value })}>
                {Object.entries(SUBJECTS).map(([grp, l]) => <optgroup key={grp} label={grp}>{l.map((nm) => <option key={nm}>{nm}</option>)}</optgroup>)}
              </select>
              <select value={r.g} onChange={(e) => upd(i, { g: e.target.value })}>{Object.keys(PTS).map((g) => <option key={g}>{g}</option>)}</select>
              <label className="note"><input type="checkbox" checked={r.c} onChange={(e) => upd(i, { c: e.target.checked })} /> Cluster</label>
              <button className="link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className="link" onClick={() => setRows([...rows, { name: 'English', g: 'B', c: false }])}>Add a subject</button>
          <div className="card paid">
            <p className="note">Best seven subjects: {t} of 84</p>
            {C ? <h3>Cluster points about {C.toFixed(3)} of 48 (estimate)</h3> : <p className="muted">Add at least 7 subjects and tick exactly four for the cluster.</p>}
            <p className="note">KUCCPS works out the official weighted points from KNEC data. Check yours in the KUCCPS portal.</p>
          </div>
          <input placeholder="Your KCSE index number, for example 12345678/2025" value={idx} onChange={(e) => setIdx(e.target.value)} />
          <label className="agree"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I checked my grades and index number. I understand this runs only once, and my results disappear 30 minutes after I run it, so I must download them.</label>
          <button className="cta full" disabled={busy || !sure} onClick={find}>{busy ? 'Working...' : 'Find my courses'}</button>
        </>
      )}
      {res && (
        <>
          <h2>Your results</h2>
          <p className="toast">Download now. Your results disappear in {mmss}. After that you must pay again to see them.</p>
          <button className="ghost" onClick={() => download(res.summary, res.courses, new Date())}>Download my results</button>
          <div className="seg">
            {[['likely', 'Likely'], ['near', 'Borderline']].map(([k, l]) => <button key={k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{l}</button>)}
            {[['best', 'Best first'], ['safe', 'Safest first']].map(([k, l]) => <button key={k} className={order === k ? 'on' : ''} onClick={() => setOrder(k)}>{l}</button>)}
          </div>
          <input placeholder="Search a course or university" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="note">{list.length} courses. Tick the ones you want to apply for.</p>
          {res.courses.length === 0 && <p className="muted">No matching courses found. The course list may not be loaded yet.</p>}
          {list.slice(0, lim).map((p) => {
            const k = `${p.programme}, ${p.institution}`;
            return (
              <label className="card pick" key={p.id}>
                <input type="checkbox" checked={sel.includes(k)} onChange={() => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k])} />
                <span><b>{p.programme}</b><span className="note"><br />{p.institution}, cut-off {p.cutoff}, your estimate {p.score}</span></span>
              </label>
            );
          })}
          {list.length > lim && <button className="link" onClick={() => setLim(lim + 40)}>Show more</button>}
          {sel.length > 0 && kuccps && <button className="cta full" onClick={() => onApply(kuccps, { choices: sel.join('; ') })}>Use {sel.length} selected courses in my KUCCPS application</button>}
          <p className="toast">Remember: download your results before the time runs out. They disappear in {mmss}. After that you must pay again.</p>
        </>
      )}
      {saved.length > 0 && !res && (
        <>
          <h2>Results still available</h2>
          {saved.map((r) => (
            <div className="card" key={r.id}>
              <p><b>Index {r.summary?.index_no || 'n/a'}</b> <span className="note">{(r.courses || []).length} courses, disappears in about {Math.max(1, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 60000))} minutes</span></p>
              <button className="link" onClick={() => setRes({ summary: r.summary, courses: r.courses || [], expires_at: r.expires_at })}>Open</button> <button className="link" onClick={() => download(r.summary, r.courses || [], r.created_at)}>Download</button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function Account({ me, reload, go, push, enablePush }) {
  const [pm, setPm] = useState('');
  async function testPush() {
    setPm('Sending...');
    const { data, error } = await sb.functions.invoke('notify', { body: { kind: 'test' } });
    if (error) return setPm('The notify function is not reachable. Run Deploy functions in GitHub. ' + error.message);
    if (!data?.ok) return setPm('Failed: ' + (data?.error || 'unknown error'));
    setPm(data.sent ? `Sent to ${data.sent} phone(s). If nothing appears, close the app and send again.` : 'Not sent. ' + (data.errors?.[0] || ''));
  }
  const [f, setF] = useState({ full_name: me.full_name || '', username: me.username || '', phone: me.phone || '', dob: me.dob || '', county: me.county || '', kcse_index: me.kcse_index || '', parent_phone: me.parent_phone || '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    const { error } = await sb.from('profiles').update({ ...f, username: f.username.trim().toLowerCase(), dob: f.dob || null }).eq('id', me.id);
    setMsg(error ? (error.code === '23505' ? 'Username already exists. Choose another one.' : error.message) : 'Saved.');
    if (!error) reload();
  }
  async function del() {
    if (!window.confirm('Ask us to delete your data? We will contact you.')) return;
    await sb.from('feedback').insert({ user_id: me.id, message: 'DATA DELETION REQUEST' });
    setMsg('Request sent. We will contact you.');
  }
  return (
    <>
      <p className="eyebrow">My account</p><h1>Your details</h1>
      <form onSubmit={save}>
        <label className="fld">Full name, surname first, as on your ID<input value={f.full_name} onChange={set('full_name')} required /></label>
        <label className="fld">Username<input value={f.username} onChange={set('username')} required /></label>
        <label className="fld">Phone (M-Pesa number)<input inputMode="tel" value={f.phone} onChange={set('phone')} required /></label>
        <label className="fld">Email (cannot be changed here)<input value={me.email || ''} readOnly /></label>
        <label className="fld">Date of birth<input type="date" value={f.dob} onChange={set('dob')} /></label>
        <label className="fld">County<input value={f.county} onChange={set('county')} /></label>
        <label className="fld">KCSE index number<input value={f.kcse_index} onChange={set('kcse_index')} /></label>
        <label className="fld">Parent or guardian phone<input inputMode="tel" value={f.parent_phone} onChange={set('parent_phone')} /></label>
        {msg && <p className="toast">{msg}</p>}
        <button className="cta full">Save changes</button>
      </form>
      {isApp && (
        <>
          <h2>Notifications</h2>
          <div className="card paid">
            <p>{!PUSH ? 'This app was built without notification support. Add the Firebase file in GitHub, then build the app again.' : push === 'on' ? 'Notifications are on for this phone.' : push === 'denied' ? 'Notifications are blocked. Open your phone Settings, then Apps, Tribridge Cyber, Notifications, and allow them.' : push === 'checking' ? 'Checking...' : push}</p>
            {PUSH && push !== 'on' && <button className="cta sm" onClick={enablePush}>Turn on notifications</button>}
            {PUSH && <button className="ghost" onClick={testPush}>Send a test notification</button>}
            {pm && <p className="toast">{pm}</p>}
          </div>
        </>
      )}
      <h2>My documents</h2>
      <p className="muted">Upload clear photos or PDFs. Only you and Tribridge Cyber can see them.</p>
      <Files uid={me.id} />
      <h2>Your data</h2>
      <button className="link" onClick={() => go('privacy')}>Read the Privacy Policy</button><br />
      <button className="link" onClick={del}>Ask us to delete my data</button>
    </>
  );
}

function Privacy() {
  return (
    <div className="pol">
      <p className="eyebrow">Privacy policy</p><h1>How we handle your data</h1>
      <p>Last updated: November 2026. Tribridge Cyber ("we") helps KCSE leavers with applications online. To reach us, send a message in the app under Feedback.</p>
      <h3>What we collect</h3>
      <p>Your account details (names, username, phone, email), the details you type into forms (for example ID number, birth certificate number, KCSE index number and parent details), documents you upload, your messages with us, and payment confirmations such as M-Pesa receipt numbers. We never ask for your passwords or M-Pesa PIN.</p>
      <h3>Why we use it</h3>
      <p>Only to do the service you ask for, to contact you, to take payment and to send you notifications.</p>
      <h3>Your consent</h3>
      <p>We rely on your consent, which you give by ticking the boxes. You can withdraw it at any time.</p>
      <h3>Who we share it with</h3>
      <p>Government portals and institutions, only as needed for your application. Our service providers, who host data (Supabase), process payments (Safaricom M-Pesa) and send notifications (Google Firebase). We use an AI tool only to polish our announcements; it never receives your personal details. We do not sell your data.</p>
      <h3>How long we keep it</h3>
      <p>Until your request is finished and for up to 90 days after, then we delete your documents and form details unless the law requires us to keep them.</p>
      <h3>Security</h3>
      <p>Your files are private and only you and our team can open them. Data travels encrypted.</p>
      <h3>If you are under 18</h3>
      <p>Your parent or guardian must agree to you using this service.</p>
      <h3>Your rights</h3>
      <p>Under Kenya's Data Protection Act you can see, correct or delete your data, object to its use, withdraw consent and complain to the Office of the Data Protection Commissioner. Edit your details or ask for deletion under My account.</p>
      <h3>Changes</h3>
      <p>We will announce any change in the app.</p>
    </div>
  );
}

function Auth({ go }) {
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ username: '', full_name: '', phone: '', email: '', password: '', consent: false, aware: false });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
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
    const { data, error } = await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { username: u, full_name: f.full_name, phone: f.phone, consent: f.consent, aware: f.aware } } });
    if (error) setMsg(error.message);
    else if (!data.session) setMsg('Account created. Confirm your email, then log in.');
  }
  return (
    <form onSubmit={submit}>
      <p className="eyebrow">{mode === 'in' ? 'Sign in' : 'Join'}</p>
      <h1>{mode === 'in' ? 'Welcome back' : 'Create your free account'}</h1>
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
        <>
          <label className="agree"><input type="checkbox" required checked={f.aware} onChange={(e) => setF({ ...f, aware: e.target.checked })} /> {AWARE}</label>
          <button type="button" className="link" onClick={() => go('privacy')}>Read the Privacy Policy</button>
          <label className="agree"><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /> {CONSENT}</label>
        </>
      )}
      {msg && <p className="err">{msg}</p>}
      <p className="warn"><b>Important:</b> we cannot recover your email or password. Remember them or write them down.</p>
      <button className="cta full">{mode === 'in' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Log in'}</button>
    </form>
  );
}

function Drawer({ me, page, admin, go, onClose }) {
  const [rs, setRs] = useState([]);
  useEffect(() => {
    if (me) sb.from('requests').select('id, status, created_at, services(title)').eq('user_id', me.id).order('created_at').then(({ data }) => setRs(data || []));
  }, []);
  const items = [['home', 'Home', 'home'], ['guide', 'Guide', 'book'], ['services', 'Services', 'grid'], ...(me ? [['requests', 'My requests', 'list']] : []), ['analyzer', 'Course analyzer', 'calc'], ...(me ? [['inbox', 'Messages', 'bell'], ['news', 'Announcements', 'bell'], ['feedback', 'Feedback', 'chat'], ['account', 'My account', 'user']] : []), ['privacy', 'Privacy policy', 'shield'], ...(admin ? [['admin', me.role === 'admin' ? 'Admin' : 'Staff panel', 'id']] : [])];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <div className="hd"><span>MENU</span><button onClick={onClose} aria-label="Close menu"><Ic n="x" /></button></div>
        {items.map(([k, l, ic, soon]) => (
          <button key={k} className={'nav' + (page === k ? ' on' : '')} onClick={() => go(k)}><Ic n={ic} />{l}{soon && <span className="soon">SOON</span>}</button>
        ))}
        {me && (
          <>
            <p className="micro">My applications</p>
            {rs.length === 0 && <p className="note">Nothing yet.</p>}
            {rs.map((r) => (<button key={r.id} className="nav" onClick={() => go('requests')}><span>{r.services?.title}<br /><span className="note">{ds(r.created_at)}</span></span><span className="soon"><Status s={r.status} /></span></button>))}
          </>
        )}
        {me ? <button className="out" onClick={() => { sb.auth.signOut(); onClose(); }}><Ic n="out" /> Sign out</button> : <button className="cta full" onClick={() => go('auth')}>Sign in / Join</button>}
      </aside>
    </>
  );
}

function PayInfo() {
  const [v, setV] = useState('');
  const [m, setM] = useState('');
  useEffect(() => { sb.from('settings').select('value').eq('key', 'pay_instructions').maybeSingle().then(({ data }) => setV(data?.value || '')); }, []);
  async function save() {
    const { error } = await sb.from('settings').upsert({ key: 'pay_instructions', value: v });
    setM(error ? error.message : 'Saved. Students see this when they pay.');
  }
  return (
    <div className="card">
      <h3>Payment instructions</h3>
      <p className="note">Students see this when they pay. Example: Send to Till 123456, name Tribridge Cyber.</p>
      <textarea value={v} onChange={(e) => setV(e.target.value)} />
      <button className="cta sm" onClick={save}>Save</button>
      {m && <p className="toast">{m}</p>}
    </div>
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
      {services.filter((s) => !s.free).map((s) => (
        <div className="card" key={s.id}><h3>{s.title}</h3>
          <div className="two"><input inputMode="numeric" placeholder="Live help" value={val(s, 'price_live')} onChange={(e) => set(s, 'price_live', e.target.value)} /><input inputMode="numeric" placeholder="Done for you" value={val(s, 'price_full')} onChange={(e) => set(s, 'price_full', e.target.value)} /></div>
          <button className="cta sm" onClick={() => save(s)}>Save</button></div>
      ))}
    </>
  );
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function Courses() {
  const [n, setN] = useState(null);
  const [msg, setMsg] = useState('');
  const count = () => sb.from('programmes').select('id', { count: 'exact', head: true }).then(({ count: c }) => setN(c));
  useEffect(() => { count(); }, []);
  async function pick(e) {
    const file = e.target.files[0];
    if (!file) return;
    const rows = parseCSV(await file.text());
    const h = (rows[0] || []).map((x) => x.trim().toLowerCase());
    const ix = (k) => h.indexOf(k);
    if (['programme', 'institution', 'req', 'cutoff'].some((k) => ix(k) < 0)) return setMsg('The first row must be: programme,institution,req,cutoff,year');
    const data = rows.slice(1).map((r) => ({
      programme: r[ix('programme')]?.trim(),
      institution: r[ix('institution')]?.trim(),
      req: r[ix('req')]?.trim(),
      cutoff: parseFloat(r[ix('cutoff')]),
      year: ix('year') >= 0 ? parseInt(r[ix('year')], 10) || null : null,
    })).filter((d) => d.programme && d.institution && d.req && !Number.isNaN(d.cutoff));
    for (let i = 0; i < data.length; i += 500) {
      const { error } = await sb.from('programmes').insert(data.slice(i, i + 500));
      if (error) return setMsg(error.message);
      setMsg(`Importing ${Math.min(i + 500, data.length)} of ${data.length}...`);
    }
    setMsg(`Done. ${data.length} courses imported, ${rows.length - 1 - data.length} rows skipped.`);
    e.target.value = '';
    count();
  }
  async function wipe() {
    if (!window.confirm('Delete ALL courses? Do this before importing a new year.')) return;
    const { error } = await sb.from('programmes').delete().gt('id', 0);
    setMsg(error ? error.message : 'All courses deleted.');
    count();
  }
  return (
    <>
      <div className="card paid">
        <h3>Course list</h3>
        <p className="note">{n === null ? 'Counting...' : `${n} courses loaded.`} The analyzer uses these rows.</p>
        <p className="note">Choose a CSV file from your phone. First row: programme,institution,req,cutoff,year. In req, separate the four subject slots with ; and choices inside a slot with /. Add :C+ after a slot for its minimum grade. Use * for any subject.</p>
        <input type="file" accept=".csv,text/csv" onChange={pick} />
        {msg && <p className="toast">{msg}</p>}
        <button className="link" onClick={wipe}>Delete all courses</button>
      </div>
    </>
  );
}

function Team() {
  const [list, setList] = useState([]);
  const [u, setU] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => sb.from('profiles').select('id, full_name, username, phone').eq('role', 'staff').order('full_name').then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, []);
  async function setRole(name, role) {
    const { error } = await sb.rpc('set_role', { uname: name, new_role: role });
    setMsg(error ? error.message : role === 'staff' ? 'Added to staff.' : 'Removed from staff.');
    if (!error) { setU(''); load(); }
  }
  return (
    <>
      <div className="card paid">
        <h3>Staff</h3>
        <p className="note">Staff can handle requests, message students and open student files. They cannot approve payments, change prices or publish announcements. The person must create an account in the app first.</p>
        <input placeholder="Username of the person to add" value={u} onChange={(e) => setU(e.target.value)} />
        <button className="cta sm" onClick={() => setRole(u.trim(), 'staff')}>Make staff</button>
        {msg && <p className="toast">{msg}</p>}
      </div>
      {list.length === 0 && <p className="muted">No staff yet.</p>}
      {list.map((s) => (
        <div className="card" key={s.id}>
          <div className="row"><div><h3>{s.full_name}</h3><p className="note">@{s.username}, {s.phone}</p></div><button className="link" onClick={() => setRole(s.username, 'student')}>Remove</button></div>
        </div>
      ))}
    </>
  );
}

function BotPanel() {
  const [h, setH] = useState(null);
  const [log, setLog] = useState([]);
  const [sms, setSms] = useState([]);
  const [txt, setTxt] = useState('');
  const [msg, setMsg] = useState('');
  const [steps, setSteps] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await sb.rpc('bot_health');
    setH(r.error ? { error: r.error.message } : r.data);
    const l = await sb.from('sms_log').select('*').order('created_at', { ascending: false }).limit(12);
    setLog(l.data || []);
    const m = await sb.from('mpesa_messages').select('*').order('created_at', { ascending: false }).limit(8);
    setSms(m.data || []);
  };
  useEffect(() => { load(); }, []);
  async function setup() {
    setBusy(true);
    setSteps(null);
    const { data, error } = await sb.functions.invoke('setup-db');
    setSteps(error ? [{ name: 'Setup function', ok: false, error: 'Not reachable. Run Deploy functions in GitHub first. ' + error.message }] : data?.steps || [{ name: 'Setup', ok: false, error: data?.error || 'Unknown error' }]);
    setBusy(false);
    load();
  }
  async function paste() {
    if (!txt.trim()) return;
    const { data, error } = await sb.rpc('admin_paste_sms', { txt });
    setMsg(error ? error.message : data);
    if (!error) { setTxt(''); load(); }
  }
  async function test() {
    const { error } = await sb.rpc('bot_test');
    setMsg(error ? error.message : 'Sent. Tap the bell icon at the top to read it.');
  }
  return (
    <>
      <div className="card paid">
        <h3>Bot setup</h3>
        <p className="note">Tap once to install or repair everything the bots need. It is safe to tap again.</p>
        <button className="cta sm" disabled={busy} onClick={setup}>{busy ? 'Working...' : 'Run setup'}</button>
        {steps && steps.map((s) => <p key={s.name} className={s.ok ? 'note' : 'err'}>{s.ok ? 'OK' : 'FAILED'}: {s.name}{s.error ? ' - ' + s.error : ''}</p>)}
      </div>
      <h2>Bot check</h2>
      {!h && <p className="muted">Checking...</p>}
      {h?.error && <p className="err">The check is not installed yet. Tap Run setup. ({h.error})</p>}
      {h && !h.error && Object.entries(h).map(([k, v]) => <p key={k} className={v === false ? 'err' : 'note'}>{typeof v === 'boolean' ? (v ? 'OK' : 'MISSING') : String(v)}: {k}</p>)}
      <button className="ghost" onClick={test}>Send myself a test message</button>
      <h2>Paste an M-Pesa message</h2>
      <p className="note">If the forwarder app misses a message, paste it here. The bot reads the code and amount and checks them against waiting payments.</p>
      <textarea value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Paste the full M-Pesa message" />
      <button className="cta sm" onClick={paste}>Check this message</button>
      {msg && <p className="toast">{msg}</p>}
      <h2>Messages received from your phone</h2>
      {log.length === 0 && <p className="muted">Nothing yet. If you got paid and nothing shows here, the forwarder app is not reaching the server.</p>}
      {log.map((l) => <p key={l.id} className="note">{new Date(l.created_at).toLocaleString('en-GB')}, {l.sender || 'unknown'}: {l.outcome}</p>)}
      <h2>Payments the bot has read</h2>
      {sms.map((m) => <p key={m.code} className="note">{m.code}, KES {m.amount}, {new Date(m.created_at).toLocaleString('en-GB')}</p>)}
    </>
  );
}

function Admin({ services, reload, role }) {
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState('requests');
  const [reqs, setReqs] = useState([]);
  const [fb, setFb] = useState([]);
  const [pays, setPays] = useState([]);
  const [news, setNews] = useState([]);
  const [flt, setFlt] = useState('all');
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const [t, setT] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState('');
  const load = async () => {
    const r = await sb.from('requests').select('*, profiles(full_name, phone, username), services(title, fields, price_live, price_full)').order('created_at', { ascending: true });
    setReqs(r.data || []);
    const f = await sb.from('feedback').select('*, profiles(username)').order('created_at', { ascending: false }).limit(30);
    setFb(f.data || []);
    const p = await sb.from('payments').select('*, profiles(full_name, username)');
    setPays(p.data || []);
    const n = await sb.from('announcements').select('*').order('created_at', { ascending: false });
    setNews(n.data || []);
  };
  useEffect(() => {
    load();
    const ch = sb.channel('requests').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, () => { load(); navigator.vibrate?.(300); }).on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  const setStatus = async (id, status) => { await sb.from('requests').update({ status }).eq('id', id); load(); };
  const payOk = async (p, r) => { await sb.from('payments').update({ status: 'paid' }).eq('id', p.id); if (r.status === 'new') await sb.from('requests').update({ status: 'in_progress' }).eq('id', r.id); load(); };
  const payNo = async (p) => { await sb.from('payments').update({ status: 'failed' }).eq('id', p.id); load(); };
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
    if (!error) { notify({ kind: 'announcement', title: t.trim(), body: b.trim() }); setT(''); setB(''); load(); }
  }
  async function saveEdit() {
    await sb.from('announcements').update({ title: edit.title, body: edit.body }).eq('id', edit.id);
    setEdit(null); load();
  }
  async function del(id) {
    if (window.confirm('Delete this announcement?')) { await sb.from('announcements').delete().eq('id', id); load(); }
  }
  const shown = reqs.filter((r) => flt === 'all' || (flt === 'pay' ? pays.some((p) => p.request_id === r.id && p.status === 'pending') : r.status === flt));
  const tabsList = isAdmin ? [['requests', 'Requests'], ['calc', 'Analyzer'], ['courses', 'Courses'], ['news', 'Announcements'], ['prices', 'Prices'], ['staff', 'Staff'], ['bot', 'Bot'], ['fb', 'Feedback']] : [['requests', 'Requests']];
  return (
    <>
      <p className="eyebrow">{isAdmin ? 'Admin' : 'Staff'}</p><h1>{isAdmin ? 'Control room' : 'Staff panel'}</h1>
      <div className="seg">{tabsList.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'requests' && (
        <>
          <p className="note">Oldest application first. {reqs.filter((r) => r.status === 'new').length} new.</p>
          <div className="seg">{['all', 'pay', 'new', 'in_progress', 'done', 'cancelled'].map((s) => <button key={s} className={flt === s ? 'on' : ''} onClick={() => setFlt(s)}>{s === 'pay' ? 'to approve' : s.replace('_', ' ')}</button>)}</div>
          <div className="tbl">
            <div className="tr h"><span>#</span><span>Date</span><span>Name and service</span><span>Status</span></div>
            {shown.map((r, i) => (
              <div key={r.id}>
                <button className="tr" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span>{i + 1}</span><span>{ds(r.created_at)}</span><span><b>{r.profiles?.full_name}</b><br /><span className="note">{r.services?.title}{pays.some((p) => p.request_id === r.id && p.status === 'pending') ? ' | payment to approve' : ''}</span></span><Status s={r.status} />
                </button>
                {open === r.id && (
                  <div className="detail">
                    <p className="note">{r.mode === 'live' ? 'Live help' : 'Done for you'}{priceOf(r) ? `, KES ${priceOf(r)}` : ''} | @{r.profiles?.username}</p>
                    {pays.filter((p) => p.request_id === r.id).map((p) => (<div key={p.id} className="toast"><p>KES {p.amount}, code {p.receipt || 'none'} ({p.status})</p>{p.status === 'pending' && isAdmin && <div className="seg"><button className="on" onClick={() => payOk(p, r)}>Approve</button><button onClick={() => payNo(p)}>Reject</button></div>}</div>))}
                    {(r.services?.fields || []).map(([k, label]) => (r.form?.[k] ? <p key={k}><span className="muted">{label}: </span>{r.form[k]}</p> : null))}
                    {r.consent_at && <p className="note">Consent given {new Date(r.consent_at).toLocaleDateString()}</p>}
                    <a href={wa(r.profiles?.phone)}>Message on WhatsApp</a> <button className="link" onClick={() => navigator.clipboard?.writeText([r.profiles?.full_name, r.profiles?.phone, ...(r.services?.fields || []).filter(([k]) => r.form?.[k]).map(([k, l]) => `${l}: ${r.form[k]}`)].join('\n'))}>Copy all details</button>
                    <Toggle label="Student files"><Files uid={r.user_id} /></Toggle>
                    <Toggle label="Messages"><Thread id={r.id} /></Toggle>
                    <div className="seg">{['new', 'in_progress', 'done', 'cancelled'].map((s) => <button key={s} className={r.status === s ? 'on' : ''} onClick={() => setStatus(r.id, s)}>{s.replace('_', ' ')}</button>)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'news' && (
        <>
          <input placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} />
          <textarea placeholder="Write the update" value={b} onChange={(e) => setB(e.target.value)} />
          <button className="link" onClick={polish}>Polish with AI</button>
          <button className="cta full" onClick={publish}>Publish</button>
          {msg && <p className="toast">{msg}</p>}
          <h2>Published</h2>
          {news.map((n) => (
            <div className="card" key={n.id}>
              {edit?.id === n.id ? (
                <>
                  <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                  <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
                  <button className="cta sm" onClick={saveEdit}>Save</button> <button className="link" onClick={() => setEdit(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <h3>{n.title}</h3><p className="muted">{n.body}</p><p className="note">{ds(n.created_at)}</p>
                  <button className="link" onClick={() => setEdit(n)}>Edit</button> <button className="link" onClick={() => del(n.id)}>Delete</button>
                </>
              )}
            </div>
          ))}
        </>
      )}
      {tab === 'calc' && (
        <>
          <p className="note">Analyzer payments. Check each M-Pesa code against your M-Pesa messages before approving.</p>
          {pays.filter((p) => p.purpose === 'calculator' && p.status === 'pending').length === 0 && <p className="muted">No analyzer payments waiting.</p>}
          {pays.filter((p) => p.purpose === 'calculator' && p.status === 'pending').map((p) => (
            <div className="card" key={p.id}>
              <div className="row"><h3>{p.profiles?.full_name}</h3><span className="px">KES {p.amount}</span></div>
              <p className="note">@{p.profiles?.username}, {ds(p.created_at)}</p>
              <p>M-Pesa code: <b>{p.receipt}</b></p>
              <button className="cta sm" onClick={() => payOk(p, { status: '' })}>Approve</button> <button className="link" onClick={() => payNo(p)}>Reject</button>
            </div>
          ))}
          <h2>Unlocked students</h2>
          {pays.filter((p) => p.purpose === 'calculator' && p.status === 'paid').map((p) => <p key={p.id} className="note">{ds(p.created_at)}, {p.profiles?.full_name}, {p.receipt}</p>)}
        </>
      )}
      {tab === 'staff' && isAdmin && <Team />}
      {tab === 'bot' && isAdmin && <BotPanel />}
      {tab === 'courses' && <Courses />}
      {tab === 'prices' && (<><PayInfo /><Prices services={services} reload={reload} /></>)}
      {tab === 'fb' && fb.map((x) => <div className="card" key={x.id}><p>{x.message}</p><p className="note">@{x.profiles?.username}</p></div>)}
    </>
  );
}

function Inbox({ me, onRead }) {
  const [ms, setMs] = useState([]);
  useEffect(() => {
    sb.from('inbox').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => setMs(data || []));
    sb.from('inbox').update({ read: true }).eq('user_id', me.id).eq('read', false).then(() => onRead());
  }, []);
  return (
    <>
      <p className="eyebrow">Messages</p><h1>From Tribridge Bot</h1>
      {ms.length === 0 && <p className="muted">No messages yet.</p>}
      {ms.map((m) => (
        <div className="card" key={m.id}><p>{m.body}</p><p className="note">{new Date(m.created_at).toLocaleString('en-GB')}</p></div>
      ))}
    </>
  );
}

function News({ news }) {
  return (
    <>
      <p className="eyebrow">Announcements</p><h1>Latest updates</h1>
      {news.length === 0 && <p className="muted">No updates yet. New announcements appear here.</p>}
      {news.map((n) => (<div className="card" key={n.id}><h3>{n.title}</h3><p className="muted">{n.body}</p><p className="note">{new Date(n.created_at).toLocaleDateString()}</p></div>))}
    </>
  );
}

function Feedback({ me }) {
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
      <p className="eyebrow">Feedback</p><h1>Tell us what to fix or add</h1>
      <textarea placeholder="Write your message" value={m} onChange={(e) => setM(e.target.value)} />
      <button className="cta full" onClick={send}>Send feedback</button>
      {ok && <p className="toast">{ok}</p>}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [services, setServices] = useState([]);
  const [news, setNews] = useState([]);
  const [page, setPage] = useState('home');
  const [menu, setMenu] = useState(false);
  const [applying, setApplying] = useState(null);
  const [pre, setPre] = useState(null);
  const [push, setPush] = useState(PUSH ? 'checking' : 'off');
  const [banner, setBanner] = useState('');
  const [unread, setUnread] = useState(0);
  const uid = session?.user?.id;
  const go = (p) => { setPage(p); setMenu(false); setApplying(null); window.scrollTo(0, 0); };
  const loadMe = () => sb.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setMe(data));
  const loadServices = () => sb.from('services').select('*').order('sort').then(({ data }) => setServices(data || []));
  const enablePush = async () => {
    try {
      const p = await PushNotifications.requestPermissions();
      if (p.receive !== 'granted') return setPush('denied');
      await PushNotifications.register();
    } catch (e) { setPush('Error: ' + (e?.message || e)); }
  };

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    loadServices();
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) { setMe(null); return; }
    setPage((p) => (p === 'auth' ? 'home' : p));
    const loadNews = () => sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(30).then(({ data }) => setNews(data || []));
    loadMe();
    loadNews();
    const ch = sb.channel('news').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, loadNews).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid]);

  useEffect(() => {
    if (!PUSH || !uid) return;
    PushNotifications.removeAllListeners().then(() => {
      PushNotifications.addListener('registration', async (t) => {
        const { error } = await sb.rpc('save_token', { t: t.value });
        setPush(error ? 'Could not save this phone: ' + error.message : 'on');
      });
      PushNotifications.addListener('registrationError', (e) => setPush('Registration failed: ' + (e?.error || 'unknown error')));
      PushNotifications.addListener('pushNotificationReceived', (n) => setBanner([n.title, n.body].filter(Boolean).join(': ')));
      enablePush();
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const run = () => flushQueue().then((n) => { if (n) setBanner(`Sent ${n} saved application${n > 1 ? 's' : ''}.`); });
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [uid]);

  useEffect(() => {
    if (!uid) { setUnread(0); return; }
    const count = () => sb.from('inbox').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false).then(({ count: c }) => setUnread(c || 0));
    count();
    const ch = sb.channel('inbox' + uid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inbox', filter: 'user_id=eq.' + uid }, (p) => { count(); setBanner(String(p.new?.body || '').slice(0, 140)); }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid]);

  if (session === undefined) return <div className="boot">Tribridge Cyber</div>;
  if (uid && !me) return <div className="boot">Loading</div>;
  const admin = ['admin', 'staff'].includes(me?.role) && isApp;
  const gated = ['requests', 'account', 'news', 'feedback', 'inbox'].includes(page) || (page === 'admin' && !admin);
  const view = !me && gated ? 'auth' : page;
  const onApply = (s, pf) => { if (!me) return go('auth'); setPre(pf || null); setApplying(s); };
  const tabs = [['home', 'Home', 'home'], ['guide', 'Guide', 'book'], ['services', 'Services', 'grid'], [me ? 'requests' : 'auth', 'Requests', 'list'], [me ? 'account' : 'auth', 'Account', 'user']];
  return (
    <>
      {banner && <div className="toast bannerfix" onClick={() => setBanner('')}>{banner}</div>}
      <header className="top">
        <button onClick={() => go('home')} aria-label="Home"><Brand /></button>
        <div className="right">
          {!me && <button className="cta sm" onClick={() => go('auth')}><Ic n="login" s={18} /> Sign in / Join</button>}
          {me && <button className="bellbtn" onClick={() => go('inbox')} aria-label="Messages"><Ic n="bell" s={24} />{unread > 0 && <span className="dot">{unread}</span>}</button>}
          <button onClick={() => setMenu(true)} aria-label="Open menu"><Ic n="menu" s={26} /></button>
        </div>
      </header>
      <main>
        {view === 'home' && <Home go={go} me={me} />}
        {view === 'guide' && <Guide go={go} />}
        {view === 'services' && <Services services={services} me={me} go={go} onApply={onApply} />}
        {view === 'requests' && me && <Requests me={me} />}
        {view === 'analyzer' && (me ? <Analyzer me={me} reload={loadMe} services={services} onApply={onApply} /> : <Auth go={go} />)}
        {view === 'news' && <News news={news} />}
        {view === 'inbox' && me && <Inbox me={me} onRead={() => setUnread(0)} />}
        {view === 'feedback' && me && <Feedback me={me} />}
        {view === 'account' && me && <Account me={me} reload={loadMe} go={go} push={push} enablePush={enablePush} />}
        {view === 'privacy' && <Privacy />}
        {view === 'auth' && <Auth go={go} />}
        {view === 'admin' && admin && <Admin services={services} reload={loadServices} role={me.role} />}
      </main>
      <nav className="tabs">
        {tabs.map(([k, l, ic]) => (<button key={l} className={page === k ? 'on' : ''} onClick={() => go(k)}><Ic n={ic} />{l}</button>))}
      </nav>
      {menu && <Drawer me={me} page={page} admin={admin} go={go} onClose={() => setMenu(false)} />}
      {applying && me && <Apply s={applying} me={me} prefill={pre} onClose={() => setApplying(null)} onDone={(off) => { go('requests'); if (off) setBanner('Saved on your phone. We will send it as soon as you are online.'); }} />}
    </>
  );
}
