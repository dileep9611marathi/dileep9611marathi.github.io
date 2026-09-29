import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  Activity, ArrowRight, Bell, Bot, Building2, Check, ChevronRight, Clock3,
  FileCheck2, Gauge, Headphones, Home as HomeIcon, Languages, Menu, Mic, Moon,
  MoreHorizontal, Navigation, Plus, RefreshCw, ShieldCheck, Sparkles, Ticket,
  Users, Volume2, X, Zap
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

let userToken = localStorage.getItem("vq_token") || "";
let currentRole = localStorage.getItem("vq_role") || "user";

async function getDemoToken(role = "user") {
  const res = await fetch(`${API_BASE}/auth/demo?role=${encodeURIComponent(role)}`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Demo authentication failed");
  userToken = data.token;
  currentRole = role;
  localStorage.setItem("vq_token", userToken);
  localStorage.setItem("vq_role", role);
  return data;
}

const api = async (path, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (userToken) headers.Authorization = `Bearer ${userToken}`;

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });

  if (res.status === 401 && path !== "/auth/demo") {
    const auth = await getDemoToken(currentRole);
    headers.Authorization = `Bearer ${auth.token}`;
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
};

function App() {
  const [page, setPage] = useState("home");
  const [mobile, setMobile] = useState(false);
  const [services, setServices] = useState([]);
  const [queue, setQueue] = useState(null);
  const [toast, setToast] = useState(null);
  const [dark, setDark] = useState(() => localStorage.getItem("vq_dark") === "1");
  const [loading, setLoading] = useState(true);

  const notify = (type, msg) => setToast({ type, msg });

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("vq_dark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const refresh = async () => {
    try {
      const data = await api("/services");
      setServices(data.services);
      const active = await api("/queues/active");
      setQueue(active.queue || null);
    } catch (e) {
      notify("info", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!userToken || currentRole !== "user") await getDemoToken("user");
        await refresh();
      } catch (e) {
        notify("info", e.message);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socket.on("queue:updated", async (payload) => {
      if (queue?.id === payload.queueId) {
        const data = await api(`/queues/${payload.queueId}`);
        setQueue(data.queue);
      }
      const data = await api("/services");
      setServices(data.services);
    });
    return () => socket.disconnect();
  }, [queue?.id]);

  const joinQueue = async (service) => {
    try {
      const result = await api("/queues", {
        method: "POST",
        body: { serviceId: service.id, idempotencyKey: crypto.randomUUID() }
      });
      setQueue(result.queue);
      setPage("queue");
      notify("success", `Token ${result.queue.tokenNumber} created.`);
    } catch (e) {
      notify("info", e.message);
    }
  };

  const releaseQueue = async () => {
    if (!queue) return;
    try {
      await api(`/queues/${queue.id}/release`, { method: "POST" });
      setQueue(null);
      notify("success", "Queue token released.");
      setPage("home");
      refresh();
    } catch (e) {
      notify("info", e.message);
    }
  };

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} mobile={mobile} close={() => setMobile(false)} />
      <div className="main">
        <Topbar page={page} setMobile={setMobile} dark={dark} setDark={setDark} />
        <main className="content">
          {loading ? <div className="empty"><RefreshCw className="spin" size={30}/><h2>Loading VoiceQueue…</h2><p>Connecting to the queue service.</p></div> :
            <>
              {page === "home" && <Home queue={queue} services={services} joinQueue={joinQueue} setPage={setPage} />}
              {page === "queue" && <QueuePage queue={queue} releaseQueue={releaseQueue} setPage={setPage} />}
              {page === "precheck" && <Precheck services={services} setToast={notify} />}
              {page === "voice" && <Voice setToast={notify} />}
              {page === "journey" && <Journey setToast={notify} />}
              {page === "admin" && <Admin setToast={notify} />}
            </>
          }
        </main>
      </div>
      {toast && <div className={`toast ${toast.type}`}><Check size={17}/>{toast.msg}</div>}
    </div>
  );
}

function Sidebar({ page, setPage, mobile, close }) {
  const items = [
    ["home", "Overview", HomeIcon],
    ["queue", "My Queue", Ticket],
    ["precheck", "Document Pre-check", FileCheck2],
    ["voice", "Voice Assistant", Mic],
    ["journey", "My Journey", Navigation],
    ["admin", "Operations", Gauge]
  ];
  return <aside className={`sidebar ${mobile ? "open" : ""}`}>
    <div className="brand">
      <div className="brandmark"><Sparkles size={18}/></div>
      <div><b>VoiceQueue</b><span>Assistant</span></div>
      <button className="icon-btn mobile-only" onClick={close}><X size={18}/></button>
    </div>
    <div className="nav">
      <small>WORKSPACE</small>
      {items.map(([id, label, Icon]) => (
        <button key={id} className={page === id ? "active" : ""} onClick={async () => { try { await getDemoToken(id === "admin" ? "admin" : "user"); } catch {} setPage(id); close(); }}>
          <Icon size={18}/><span>{label}</span>{id === "queue" && <i className="nav-dot"/>}
        </button>
      ))}
    </div>
    <div className="sidebar-bottom">
      <div className="mini-card"><ShieldCheck size={17}/><div><b>Fair queue</b><span>Audit protected</span></div></div>
      <div className="user"><div className="avatar">N</div><div><b>Nikhil</b><span>Member</span></div><MoreHorizontal size={18}/></div>
    </div>
  </aside>;
}

function Topbar({ page, setMobile, dark, setDark }) {
  const title = {
    home: "Good evening, Nikhil", queue: "My active queue", precheck: "Document pre-check",
    voice: "Voice assistant", journey: "Service journey", admin: "Operations dashboard"
  }[page];
  return <header className="topbar">
    <button className="icon-btn mobile-only" onClick={() => setMobile(true)}><Menu/></button>
    <div><h1>{title}</h1><p>{page === "home" ? "Know your turn. Not the waiting room." : "Live updates are synced automatically."}</p></div>
    <div className="top-actions">
      <button className="icon-btn" onClick={() => setDark(!dark)}>{dark ? <Zap size={18}/> : <Moon size={18}/>}</button>
      <button className="icon-btn notif"><Bell size={18}/><i/></button>
      <div className="avatar">N</div>
    </div>
  </header>;
}

function Home({ queue, services, joinQueue, setPage }) {
  return <div className="stack">
    <section className="hero">
      <div><div className="eyebrow"><span className="pulse"/> LIVE QUEUES</div>
        <h2>Skip the waiting.<br/><em>Know your turn.</em></h2>
        <p>Join remotely, validate documents before you travel, and get a realistic window for your turn.</p>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => document.getElementById("services")?.scrollIntoView({behavior:"smooth"})}><Plus size={18}/>Join a queue</button>
          <button className="btn ghost" onClick={() => setPage("precheck")}><FileCheck2 size={17}/>Check documents</button>
        </div>
      </div>
      <div className="hero-orbit"><div className="orbit-ring"/>
        <div className="orbit-card"><Clock3/><b>38 min</b><span>predicted wait</span></div>
        <div className="orbit-small"><ShieldCheck size={15}/> 87% confidence</div>
      </div>
    </section>

    {queue && <section className="active-banner" onClick={() => setPage("queue")}>
      <div className="token-circle">{queue.tokenNumber}</div>
      <div><span>YOUR ACTIVE TOKEN</span><b>{queue.serviceName} · {queue.organization}</b>
        <p>You're #{queue.position} • estimated {queue.etaMin}–{queue.etaMax} min</p>
      </div><ChevronRight/>
    </section>}

    <section className="section-head" id="services">
      <div><h3>Nearby services</h3><p>Live estimated waits · synced from backend</p></div>
      <button className="text-btn" onClick={() => window.location.reload()}><RefreshCw size={15}/> Refresh</button>
    </section>

    <div className="service-grid">{services.map(s => <ServiceCard key={s.id} service={s} onJoin={joinQueue}/>)}</div>

    <section className="feature-row">
      <Feature icon={FileCheck2} title="Never get rejected" text="Pre-check documents before leaving home." onClick={() => setPage("precheck")}/>
      <Feature icon={Mic} title="Just talk" text="Check your queue in your language." onClick={() => setPage("voice")}/>
      <Feature icon={Navigation} title="Leave at the right time" text="Get a smart travel window, not a guess." onClick={() => setPage("queue")}/>
    </section>
  </div>;
}

function ServiceCard({ service, onJoin }) {
  return <article className="service-card">
    <div className={`service-icon ${service.color}`}><Building2 size={20}/></div>
    <div className="service-title"><div><h4>{service.name}</h4><p>{service.org}</p></div><button className="icon-btn small"><MoreHorizontal size={17}/></button></div>
    <div className="wait"><div><b>{service.wait} min</b><span>estimated wait</span></div><div className="people"><Users size={15}/>{service.people} waiting</div></div>
    <div className="bar"><span style={{width:`${Math.min(90,service.people*3+15)}%`}}/></div>
    <button className="btn secondary full" onClick={() => onJoin(service)}>Join remotely <ArrowRight size={16}/></button>
  </article>;
}

function Feature({icon:Icon,title,text,onClick}) {
  return <button className="feature" onClick={onClick}><div className="feature-icon"><Icon size={18}/></div><div><b>{title}</b><span>{text}</span></div><ArrowRight size={16}/></button>;
}

function QueuePage({ queue, releaseQueue, setPage }) {
  const [confirm, setConfirm] = useState(false);
  if (!queue) return <Empty title="No active queue" text="Join a service from the overview to start."/>;

  return <div className="stack">
    <section className="queue-hero"><div><div className="eyebrow green"><span className="pulse"/> YOU'RE IN THE QUEUE</div>
      <h2>Token <strong>#{queue.tokenNumber}</strong></h2><p>{queue.serviceName} · {queue.organization}</p></div>
      <div className="token-big">{queue.tokenNumber}</div>
    </section>

    <div className="metric-grid">
      <Metric label="Your position" value={`#${queue.position}`} sub="people ahead" icon={Users}/>
      <Metric label="Estimated wait" value={`${queue.etaMin}–${queue.etaMax} min`} sub="live prediction" icon={Clock3}/>
      <Metric label="Confidence" value={`${queue.confidence}%`} sub="prediction quality" icon={Activity}/>
    </div>

    <section className="panel"><div className="panel-head"><div><h3>Smart leave window</h3><p>Queue prediction + travel buffer.</p></div><span className="tag green">LIVE</span></div>
      <div className="leave-box"><div className="leave-time"><span>Leave around</span><b>{queue.leaveAt}</b><small>to arrive 5–10 min early</small></div>
        <div className="route"><Navigation size={18}/><div><b>{queue.travelMin}–{queue.travelMax} min travel</b><span>Travel estimate from demo profile</span></div></div></div>
      <div className="prediction"><Sparkles size={16}/><span>ETA is recalculated whenever the queue changes.</span></div>
    </section>

    <section className="panel"><div className="panel-head"><div><h3>Queue progress</h3><p>Every token movement is audit logged.</p></div><ShieldCheck size={19}/></div>
      <div className="timeline">
        <Step done title="Token created" time={formatTime(queue.createdAt)}/>
        <Step done={queue.precheckStatus === "passed"} title="Documents pre-check" time={queue.precheckStatus === "passed" ? "Ready" : "Optional"}/>
        <Step current title={`Position #${queue.position}`} time="Live"/>
        <Step title="Your turn" time={`~${queue.etaMin} min`}/>
      </div>
    </section>

    <div className="danger-row"><div><b>Need to leave?</b><span>Release your token and rejoin later.</span></div>
      <button className="btn danger" onClick={() => setConfirm(true)}>Release token</button>
    </div>

    {confirm && <Modal title="Release your token?" onClose={() => setConfirm(false)}>
      <p className="modal-text">Your current place will be released. The action is recorded in the audit log.</p>
      <div className="modal-actions"><button className="btn ghost" onClick={() => setConfirm(false)}>Keep it</button>
        <button className="btn danger" onClick={async () => { setConfirm(false); await releaseQueue(); }}>Release token</button>
      </div>
    </Modal>}
  </div>;
}

function formatTime(value) {
  if (!value) return "Now";
  return new Date(value).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

function Step({done,current,title,time}) {
  return <div className={`step ${done?"done":""} ${current?"current":""}`}>
    <div className="step-dot">{done?<Check size={13}/>:current?<Activity size={13}/>:<span/>}</div>
    <div><b>{title}</b><span>{time}</span></div>
  </div>;
}

function Metric({label,value,sub,icon:Icon}) {
  return <div className="metric"><div className="metric-icon"><Icon size={17}/></div><span>{label}</span><b>{value}</b><small>{sub}</small></div>;
}

function Precheck({services,setToast}) {
  const [service,setService] = useState(services[0]);
  const [docs,setDocs] = useState({});
  const [result,setResult] = useState(null);

  useEffect(() => { if (services.length && !service) setService(services[0]); }, [services]);

  if (!service) return <Empty title="No services" text="The backend returned no services."/>;

  const required = service.docs || [];

  const run = async () => {
    try {
      const documents = required.map(name => ({name, present: !!docs[name]}));
      const data = await api("/precheck", {method:"POST", body:{serviceId:service.id, documents}});
      setResult(data.result);
      setToast(data.result.passed ? "success" : "info", data.result.passed ? "Pre-check passed." : "Some documents need attention.");
    } catch(e) { setToast("info", e.message); }
  };

  return <div className="stack">
    <section className="intro"><div className="intro-icon"><FileCheck2/></div><div><h2>Never get rejected at the counter.</h2><p>Check the required documents before you travel. This demo stores only checklist results.</p></div></section>
    <section className="panel"><div className="panel-head"><div><h3>1. Select your service</h3><p>Requirements are served by the backend.</p></div></div>
      <div className="select-grid">{services.map(s => <button className={`select-card ${service.id===s.id?"selected":""}`} key={s.id} onClick={() => {setService(s);setDocs({});setResult(null);}}>
        <Building2 size={17}/><b>{s.name}</b><span>{s.docs.length} documents</span>{service.id===s.id&&<Check size={15}/>}
      </button>)}</div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>2. Document checklist</h3><p>Mark documents you currently have.</p></div><span className="tag">RULE ENGINE</span></div>
      <div className="doc-list">{required.map((d,i) => <button className={`doc ${docs[d]?"checked":""}`} key={d} onClick={() => setDocs({...docs,[d]:!docs[d]})}>
        <div className="doc-check">{docs[d]?<Check size={14}/>:<span>{i+1}</span>}</div><div><b>{d}</b><span>{docs[d]?"Marked as available":"Tap to mark as available"}</span></div><ChevronRight size={16}/>
      </button>)}</div>
      <button className="btn primary full" onClick={run}><Sparkles size={17}/> Run smart pre-check</button>
      {result && <div className="check-result"><div className="result-icon"><Check/></div><div><b>{result.passed ? "Ready to travel" : "Attention required"}</b><span>{result.message}</span></div><ShieldCheck size={18}/></div>}
    </section>
    <div className="privacy-note"><ShieldCheck size={17}/><span><b>Privacy by design.</b> This demo does not upload document images.</span></div>
  </div>;
}

function Voice({setToast}) {
  const [listening,setListening] = useState(false);
  const [lang,setLang] = useState("English");
  const commands = ["What's my queue status?","When should I leave?","What documents do I need?"];

  const start = () => {
    setListening(true);
    const locale = lang === "Kannada" ? "kn-IN" : lang === "Hindi" ? "hi-IN" : "en-IN";
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (Recognition) {
      const recognition = new Recognition();
      recognition.lang = locale;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        try {
          const result = await api("/voice/intent", { method:"POST", body:{text:transcript} });
          setToast("success", result.response);
          if ("speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance(result.response);
            utterance.lang = locale;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
          }
        } catch (e) { setToast("info", e.message); }
      };
      recognition.onerror = () => setToast("info", "Voice recognition was unavailable. Try again or use a sample command.");
      recognition.onend = () => setListening(false);
      recognition.start();
      return;
    }

    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance("VoiceQueue is ready. Try asking about your queue status.");
      utterance.lang = locale;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
    setTimeout(() => { setListening(false); setToast("success","Voice demo ready. Your browser does not expose speech recognition."); }, 1200);
  };

  return <div className="stack">
    <section className="voice-card"><div className="voice-glow"><div className={`mic ${listening?"listening":""}`}><Mic size={30}/></div></div>
      <div className="eyebrow"><span className="pulse"/> VOICE READY</div><h2>Just ask.</h2><p>No typing. No searching. Use a natural voice command.</p>
      <button className={`voice-btn ${listening?"active":""}`} onClick={start}><Mic size={20}/>{listening?"Listening…":"Tap to speak"}</button>
      <div className="language"><Languages size={16}/><span>Language</span>{["English","Hindi","Kannada"].map(x => <button className={lang===x?"selected":""} onClick={() => setLang(x)} key={x}>{x}</button>)}</div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Try saying</h3><p>Voice intents are ready for backend integration.</p></div><Headphones size={18}/></div>
      <div className="command-list">{commands.map(c => <button key={c} onClick={() => setToast("info",`Command ready: “${c}”`)}><Volume2 size={16}/><span>{c}</span><ArrowRight size={15}/></button>)}</div>
    </section>
    <div className="two-col"><div className="mini-panel"><ShieldCheck size={18}/><b>No raw voice by default</b><span>Use transcription + intent, then discard audio.</span></div><div className="mini-panel"><Languages size={18}/><b>Local-language ready</b><span>English, Hindi and Kannada UI/voice settings.</span></div></div>
  </div>;
}

function Journey({setToast}) {
  const [active,setActive] = useState(1);
  const [steps,setSteps] = useState([
    ["Registration","CityCare Hospital"],
    ["Lab tests","Ground floor"],
    ["Doctor consultation","Room 204"],
    ["Pharmacy","Counter 2"]
  ]);

  const continueJourney = async () => {
    try {
      await api("/journeys/active/advance", {method:"POST", body:{stepIndex:active}});
      setActive(Math.min(active + 1, steps.length - 1));
      setToast("success","Next journey step saved.");
    } catch(e) { setToast("info",e.message); }
  };

  return <div className="stack">
    <section className="intro"><div className="intro-icon green"><Navigation/></div><div><h2>One visit. One smart journey.</h2><p>Orchestrate registration → lab → doctor → pharmacy with one journey.</p></div></section>
    <section className="journey-panel"><div className="journey-line"/>
      {steps.map(([title,loc],i) => <button key={title} className={`journey-step ${i<active?"done":""} ${i===active?"active":""}`} onClick={() => setActive(i)}>
        <div className="journey-dot">{i<active?<Check size={13}/>:i+1}</div><div><b>{title}</b><span>{loc}</span>{i===active&&<small>Next recommended step</small>}</div><ChevronRight size={17}/>
      </button>)}
    </section>
    <div className="recommend"><Sparkles size={18}/><div><b>Smart route recommendation</b><span>Complete your lab test while the doctor queue is processing. Estimated idle time saved: <strong>24 min</strong>.</span></div></div>
    <button className="btn primary" onClick={continueJourney}>Continue to next step <ArrowRight size={17}/></button>
  </div>;
}

function Admin({setToast}) {
  const [data,setData] = useState(null);
  const [sim,setSim] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await getDemoToken("admin");
        const d = await api("/admin/dashboard");
        setData(d.dashboard);
      } catch (e) {
        setToast("info", e.message);
      }
    })();
  }, []);

  if (!data) return <div className="empty"><RefreshCw className="spin" size={30}/><h2>Loading operations…</h2><p>Fetching live analytics.</p></div>;

  return <div className="stack">
    <section className="admin-head"><div><div className="eyebrow"><span className="pulse"/> OPERATIONS LIVE</div><h2>Queue health at a glance.</h2><p>Signals for staffing, bottlenecks and accountability.</p></div>
      <button className="btn secondary" onClick={() => api("/admin/dashboard").then(d=>setData(d.dashboard))}><RefreshCw size={16}/> Refresh data</button>
    </section>

    <div className="metric-grid admin-metrics">
      <Metric label="People waiting" value={data.peopleWaiting} sub="across services" icon={Users}/>
      <Metric label="Avg wait" value={`${data.avgWait}m`} sub="current estimate" icon={Clock3}/>
      <Metric label="No-show rate" value={`${data.noShowRate}%`} sub="last 24 hours" icon={Activity}/>
      <Metric label="Active counters" value={`${data.activeCounters}/${data.totalCounters}`} sub="configured capacity" icon={Gauge}/>
    </div>

    <section className="panel"><div className="panel-head"><div><h3>Hourly queue load</h3><p>Today · all services</p></div><span className="tag green">LIVE</span></div>
      <div className="chart">{data.hourlyLoad.map((height,i)=><div className="bar-col" key={i}><div className="bar-fill" style={{height:`${height}%`}}/><span>{i+8}</span></div>)}</div>
    </section>

    <div className="two-col">
      <section className="panel"><div className="panel-head"><div><h3>Bottleneck detection</h3><p>Automatic operational signal</p></div><span className="tag orange">ATTENTION</span></div>
        <div className="alert-card"><Zap size={18}/><div><b>{data.bottleneck.title}</b><span>{data.bottleneck.message}</span></div></div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>Fairness log</h3><p>Recent auditable events</p></div><ShieldCheck size={18}/></div>
        <div className="audit">{data.audit.map((x,i)=><React.Fragment key={i}><span><b>{x.type}</b> {x.message}</span><time>{x.time}</time></React.Fragment>)}</div>
      </section>
    </div>

    <section className="simulator"><div><div className="sim-icon"><Bot size={20}/></div><div><h3>Digital twin simulator</h3><p>Test a staffing change without affecting the real queue.</p></div></div>
      <div className="sim-control"><span>+1 counter</span><button className="fake-switch" onClick={() => setSim(!sim)}><i className={sim?"on":""}/></button><b>{sim ? `Projected wait ${Math.max(5,data.avgWait-5)}m` : "Click to simulate"}</b></div>
    </section>
  </div>;
}

function Empty({title,text}) {
  return <div className="empty"><Ticket size={32}/><h2>{title}</h2><p>{text}</p></div>;
}

function Modal({title,onClose,children}) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}
  </div></div>;
}

createRoot(document.getElementById("root")).render(<App />);
