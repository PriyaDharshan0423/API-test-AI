"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Braces, Check, ChevronDown, CircleHelp, CloudUpload, Code2, FileJson2, FlaskConical, Gauge, LayoutDashboard, MoreHorizontal, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Terminal, WandSparkles, X, Zap } from "lucide-react";

type Endpoint = { method: string; path: string; description: string; status: string; time: string; color: string; schema?: Record<string, unknown> };
const initialEndpoints: Endpoint[] = [
  { method: "POST", path: "/v1/customers", description: "Create a customer", status: "Healthy", time: "142 ms", color: "purple", schema: { type: "object", required: ["customerId", "name"], properties: { customerId: { type: "string" }, name: { type: "string" } }, additionalProperties: false } },
  { method: "GET", path: "/v1/customers/{id}", description: "Get customer details", status: "Healthy", time: "86 ms", color: "green", schema: { type: "object", required: ["customerId"], properties: { customerId: { type: "string" } } } },
  { method: "PATCH", path: "/v1/customers/{id}", description: "Update a customer", status: "Needs attention", time: "—", color: "orange", schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } } } },
  { method: "DELETE", path: "/v1/customers/{id}", description: "Delete a customer", status: "Healthy", time: "121 ms", color: "red", schema: { type: "object", properties: {} } },
];
const starterPayload = '{\n  "customerId": "CUST001",\n  "name": "John Doe"\n}';
const seedRuns = [
  { name: "Customer API regression", detail: "12 endpoints · Production", result: "48/48", time: "2 min ago", status: "success" },
  { name: "Payments smoke test", detail: "8 endpoints · Staging", result: "32/32", time: "1 hour ago", status: "success" },
  { name: "Auth API edge cases", detail: "6 endpoints · Staging", result: "21/24", time: "3 hours ago", status: "failed" },
  { name: "Orders contract tests", detail: "14 endpoints · Production", result: "56/56", time: "Yesterday", status: "success" },
];
const buildNavItems: { label: string; Icon: typeof LayoutDashboard }[] = [
  { label: "Overview", Icon: LayoutDashboard },
  { label: "Endpoints", Icon: Braces },
  { label: "Test runs", Icon: FlaskConical },
  { label: "Collections", Icon: FileJson2 },
];

export default function Home() {
  const [payload, setPayload] = useState(starterPayload);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>(initialEndpoints);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>(initialEndpoints[0]);
  const [runs, setRuns] = useState(seedRuns);
  const [activeNav, setActiveNav] = useState("Overview");
  const [period, setPeriod] = useState("Last 7 days");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [panel, setPanel] = useState<"import" | "run" | "help" | "notifications" | "settings" | null>(null);
  const [toast, setToast] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const filteredEndpoints = useMemo(() => endpoints.filter((endpoint) => `${endpoint.method} ${endpoint.path} ${endpoint.description}`.toLowerCase().includes(query.toLowerCase())), [endpoints, query]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setShowSearch(true); }
      if (event.key === "Escape") { setShowSearch(false); setPanel(null); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function selectEndpoint(endpoint: Endpoint) {
    setSelectedEndpoint(endpoint);
    const sample = endpoint.method === "POST" ? { customerId: "CUST001", name: "John Doe" } : endpoint.method === "PATCH" ? { name: "Jane Doe" } : endpoint.method === "GET" ? { customerId: "CUST001" } : {};
    setPayload(JSON.stringify(sample, null, 2));
    setValid(null); setNotice("");
  }

  async function importSpec(file?: File) {
    if (!file) return;
    setImportBusy(true);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/openapi/import`, { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.json()).detail || "Import failed");
      const result = await response.json();
      const imported: Endpoint[] = result.endpoints.map((item: { method: string; path: string; summary?: string; operationId?: string; requestSchema?: Record<string, unknown> }) => ({ method: item.method, path: item.path, description: item.summary || item.operationId || "Imported operation", status: "Healthy", time: "—", color: item.method === "GET" ? "green" : item.method === "DELETE" ? "red" : "purple", schema: item.requestSchema }));
      setEndpoints((current) => [...imported, ...current.filter((endpoint) => !imported.some((item) => item.method === endpoint.method && item.path === endpoint.path))]);
      setPanel(null); setToast(`Imported ${imported.length} endpoints from ${result.title}.`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Unable to import this API specification."); }
    finally { setImportBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function createTestRun() {
    setRunBusy(true);
    const run = { name: `${selectedEndpoint.description} test`, detail: `1 endpoint · Local schema validation`, result: "…", time: "just now", status: "success" };
    try {
      const requestSchema = selectedEndpoint.schema || { type: "object", properties: {} };
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: JSON.parse(payload), schema: requestSchema }) });
      if (!response.ok) throw new Error("Validation service returned an error.");
      const result = await response.json();
      const finalRun = { ...run, result: result.valid ? "1/1" : "0/1", status: result.valid ? "success" : "failed" };
      setRuns((current) => [finalRun, ...current]);
      setToast(result.valid ? "Test run complete — request passed schema validation." : `Test run complete — ${result.issues.length} schema issue${result.issues.length === 1 ? "" : "s"} found.`);
    } catch (error) { setToast(error instanceof Error && error.message ? error.message : "Check that the request body contains valid JSON."); }
    finally { setRunBusy(false); setPanel(null); }
  }

  async function validate() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: JSON.parse(payload), schema: selectedEndpoint.schema || { type: "object", properties: {} } }),
      });
      if (!response.ok) throw new Error("API validation request failed");
      const result = await response.json(); setValid(result.valid);
      setNotice(result.valid ? "Payload matches the endpoint schema." : result.issues.map((issue: { plainEnglish: string }) => issue.plainEnglish).join(" "));
    } catch (error) {
      setValid(false); setNotice(error instanceof SyntaxError ? "That JSON is malformed. Check the commas and quotes, then try again." : "Could not reach the API. Start the backend at localhost:8000 to validate.");
    } finally { setBusy(false); }
  }

  async function autoFix() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: JSON.parse(payload), schema: selectedEndpoint.schema || { type: "object", properties: {} } }) });
      if (!response.ok) throw new Error("fix failed");
      const result = await response.json(); setPayload(JSON.stringify(result.payload, null, 2)); setValid(result.validation.valid); setNotice(result.validation.valid ? "AI repair applied — payload is valid." : "Suggested repair applied. Review the remaining validation issues.");
    } catch { setNotice("Start the API service to use schema-aware auto-fix."); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Braces size={19} strokeWidth={2.5}/></div><span>api<span className="brand-ai">test</span><b>ai</b></span><button className="workspace-switch"><ChevronDown size={14}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-card"><div className="workspace-avatar">A</div><div><strong>Acme Engineering</strong><small>Free plan</small></div><ChevronDown className="workspace-chevron" size={15}/></div>
      <div className="nav-group"><div className="nav-heading">BUILD</div>{buildNavItems.map(({ label, Icon }) => <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => { setActiveNav(label); if (label === "Endpoints") document.getElementById("endpoints")?.scrollIntoView({ behavior: "smooth" }); else if (label === "Test runs") document.getElementById("runs")?.scrollIntoView({ behavior: "smooth" }); else if (label === "Collections") setPanel("import"); else window.scrollTo({ top: 0, behavior: "smooth" }); }}><Icon size={17}/>{label}{label === "Endpoints" && <span className="nav-count">{endpoints.length}</span>}{label === "Test runs" && <span className="nav-count">{runs.length}</span>}</button>)}</div>
      <div className="nav-group"><div className="nav-heading">MANAGE</div><button className={`nav-item ${activeNav === "Activity" ? "active" : ""}`} onClick={() => { setActiveNav("Activity"); document.getElementById("runs")?.scrollIntoView({ behavior: "smooth" }); }}><Activity size={17}/>Activity</button><button className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={() => { setActiveNav("Settings"); setPanel("settings"); }}><Settings2 size={17}/>Settings</button></div>
      <div className="sidebar-bottom"><div className="usage-card"><div className="usage-head"><span>Monthly tests</span><span>68%</span></div><div className="usage-track"><i/></div><small>680 of 1,000 tests used</small><button className="upgrade-link" onClick={() => setToast("Plan upgrades will be available when billing is configured.")}>Upgrade plan <ArrowUpRight size={12}/></button></div><div className="user-row"><div className="user-avatar">JD</div><div><strong>Jamie Davis</strong><small>jamie@acme.dev</small></div><button className="user-menu" aria-label="User menu" onClick={() => setPanel("settings")}><MoreHorizontal size={18}/></button></div></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <b>{activeNav}</b></div><div className="top-actions">{showSearch ? <div className="search-active"><Search size={15}/><input autoFocus placeholder="Search endpoints…" value={query} onChange={(event) => { setQuery(event.target.value); setActiveNav("Endpoints"); }}/><button onClick={() => { setShowSearch(false); setQuery(""); }}>Esc</button></div> : <button className="search-button" onClick={() => setShowSearch(true)}><Search size={15}/><span>Search anything...</span><kbd>⌘ K</kbd></button>}<button className="icon-button" aria-label="Help" onClick={() => setPanel("help")}><CircleHelp size={18}/></button><button className="icon-button notification" aria-label="Notifications" onClick={() => setPanel("notifications")}><Bell size={18}/><i/></button><button className="top-avatar" aria-label="Open profile settings" onClick={() => setPanel("settings")}>JD</button></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> TUESDAY, OCTOBER 13, 2026</div><h1>Good morning, Jamie <span>✳</span></h1><p>Here&apos;s what&apos;s happening with your APIs today.</p></div><div className="welcome-actions"><button className="button button-secondary" onClick={() => setPanel("import")}><CloudUpload size={16}/>Import spec</button><button className="button button-primary" onClick={() => setPanel("run")}><Plus size={17}/>New test run</button><input ref={fileInput} type="file" accept=".json,.yaml,.yml,application/json,text/yaml" hidden onChange={(event) => importSpec(event.target.files?.[0])}/></div></section>
        <section className="metrics-grid">
          <article className="metric-card"><div className="metric-top"><span>API health score</span><span className="metric-icon purple"><Gauge size={17}/></span></div><div className="metric-value">96<span className="metric-unit">/100</span><span className="metric-change positive"><ArrowUpRight size={14}/> 4.2%</span></div><div className="metric-foot"><div className="sparkline"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><span>vs. last 7 days</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>Tests passed</span><span className="metric-icon mint"><ShieldCheck size={17}/></span></div><div className="metric-value">98.4<span className="metric-unit">%</span><span className="metric-change positive"><ArrowUpRight size={14}/> 2.1%</span></div><div className="metric-foot"><div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><span>this week</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>Active endpoints</span><span className="metric-icon blue"><Code2 size={17}/></span></div><div className="metric-value">{endpoints.length}<span className="metric-change neutral">in this session</span></div><div className="metric-foot"><span className="status-dot"/> <span>{endpoints.filter((endpoint) => endpoint.status === "Healthy").length} healthy</span><span className="warning-dot"/><span>{endpoints.filter((endpoint) => endpoint.status !== "Healthy").length} need attention</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>Avg. response time</span><span className="metric-icon amber"><Zap size={17}/></span></div><div className="metric-value">124<span className="metric-unit">ms</span><span className="metric-change positive"><ArrowDownRight size={14}/> 8.6%</span></div><div className="metric-foot"><span className="latency-line"><i/></span><span>faster than last week</span></div></article>
        </section>
        <section className="middle-grid">
          <article className="panel activity-panel"><div className="panel-heading"><div><h2>Test activity</h2><p>Test performance over time</p></div><select className="select-button" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Today</option></select></div><div className="chart-legend"><span><i className="legend-purple"/>Passed</span><span><i className="legend-gray"/>Failed</span><b>{runs.length + 1280} <small>tests run · {period.toLowerCase()}</small></b></div><div className="chart"><div className="chart-y"><span>400</span><span>300</span><span>200</span><span>100</span><span>0</span></div><div className="chart-plot"><div className="gridline g1"/><div className="gridline g2"/><div className="gridline g3"/><div className="gridline g4"/><svg viewBox="0 0 660 150" preserveAspectRatio="none" aria-label="Passed and failed tests line chart"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7657ef" stopOpacity=".16"/><stop offset="100%" stopColor="#7657ef" stopOpacity="0"/></linearGradient></defs><path d="M0 111 C40 100 48 82 90 91 S145 105 185 71 S240 82 277 65 S325 77 370 46 S420 60 463 52 S515 70 555 38 S610 43 660 18 L660 150 L0 150Z" fill="url(#fill)"/><path d="M0 111 C40 100 48 82 90 91 S145 105 185 71 S240 82 277 65 S325 77 370 46 S420 60 463 52 S515 70 555 38 S610 43 660 18" fill="none" stroke="#7657ef" strokeWidth="2.5"/><path d="M0 136 C50 133 60 127 100 131 S155 139 190 127 S235 133 280 122 S330 130 370 119 S425 126 465 113 S520 123 555 110 S610 119 660 103" fill="none" stroke="#d8d5e2" strokeWidth="2" strokeDasharray="4 5"/></svg><div className="chart-x"><span>Oct 07</span><span>Oct 08</span><span>Oct 09</span><span>Oct 10</span><span>Oct 11</span><span>Oct 12</span><span>Oct 13</span></div></div></div></article>
          <article className="panel runs-panel" id="runs"><div className="panel-heading"><div><h2>Recent test runs</h2><p>Your latest validation activity</p></div><button className="text-link" onClick={() => setToast(`${runs.length} test runs shown.`)}>View all <ArrowUpRight size={13}/></button></div><div className="run-list">{runs.map((run, index) => <div className="run-item" key={`${run.name}-${index}`}><div className={`run-icon ${run.status}`} >{run.status === "success" ? <Check size={16}/> : <X size={16}/>}</div><div className="run-copy"><strong>{run.name}</strong><small>{run.detail}</small></div><div className={`run-result ${run.status === "failed" ? "failed-text" : ""}`}><b>{run.result}</b><small>{run.time}</small></div></div>)}</div></article>
        </section>
        <section className="bottom-grid">
          <article className="panel endpoints-panel" id="endpoints"><div className="panel-heading"><div><h2>Endpoints</h2><p>{filteredEndpoints.length} API operations</p></div><button className="text-link" onClick={() => fileInput.current?.click()}>Import spec <CloudUpload size={13}/></button></div><div className="endpoint-table"><div className="table-head"><span>ENDPOINT</span><span>DESCRIPTION</span><span>HEALTH</span><span>LATENCY</span><span/></div>{filteredEndpoints.map((endpoint) => <button className={`endpoint-row ${selectedEndpoint.path === endpoint.path && selectedEndpoint.method === endpoint.method ? "selected" : ""}`} key={endpoint.path + endpoint.method} onClick={() => selectEndpoint(endpoint)}><span className="endpoint-name"><b className={`method ${endpoint.color}`}>{endpoint.method}</b><code>{endpoint.path}</code></span><span className="endpoint-description">{endpoint.description}</span><span><i className={`health-dot ${endpoint.status === "Healthy" ? "ok" : "attention"}`}/>{endpoint.status}</span><span className="latency">{endpoint.time}</span><MoreHorizontal size={16}/></button>)}</div></article>
          <article className="panel playground"><div className="playground-head"><div><div className="playground-title"><span className="play-icon"><Terminal size={15}/></span><h2>AI playground</h2><span className="beta">BETA</span></div><p>Validating: {selectedEndpoint.description}</p></div><button className="more-btn" aria-label="Playground help" onClick={() => setPanel("help")}><MoreHorizontal size={18}/></button></div><div className="endpoint-select" role="button" tabIndex={0} onClick={() => document.getElementById("endpoints")?.scrollIntoView({ behavior: "smooth" })} onKeyDown={(event) => { if (event.key === "Enter") document.getElementById("endpoints")?.scrollIntoView({ behavior: "smooth" }); }}><span className={`method ${selectedEndpoint.color}`}>{selectedEndpoint.method}</span><span>{selectedEndpoint.path}</span><ChevronDown size={14}/></div><div className="editor-head"><span><Braces size={13}/> Request body</span><button onClick={() => { selectEndpoint(selectedEndpoint); setNotice("Payload reset for the selected endpoint."); }}>Reset</button></div><textarea className="payload-editor" value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} aria-label="JSON request body"/><div className={`validation-message ${valid === true ? "is-valid" : valid === false ? "is-invalid" : ""}`}>{valid === true ? <Check size={14}/> : valid === false ? <X size={14}/> : <Sparkles size={14}/>}<span>{notice || "Validate this JSON against the selected endpoint schema."}</span></div><div className="play-actions"><button className="button button-run" onClick={validate} disabled={busy}><Play size={14} fill="currentColor"/>{busy ? "Working…" : "Validate payload"}</button><button className="button button-fix" onClick={autoFix} disabled={busy}><WandSparkles size={14}/>Auto-fix with AI</button><button className="button button-secondary run-inline" onClick={() => setPanel("run")}><FlaskConical size={14}/>Run test</button></div></article>
        </section>
        <footer className="footer"><span>© 2026 API Test AI</span><span><i className="status-dot"/> All systems operational</span><button className="footer-link" onClick={() => setPanel("notifications")}>Changelog <ArrowUpRight size={11}/></button><button className="footer-link" onClick={() => window.open("http://localhost:8000/docs", "_blank", "noopener,noreferrer")}>API docs <ArrowUpRight size={11}/></button></footer>
      </div>
    </section>
    {toast && <div className="toast" role="status"><Check size={15}/><span>{toast}</span><button aria-label="Dismiss message" onClick={() => setToast("")}><X size={14}/></button></div>}
    {panel && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><h2 id="modal-title">{panel === "import" ? "Import API specification" : panel === "run" ? "Run a schema test" : panel === "help" ? "Playground help" : panel === "notifications" ? "Notifications" : "Workspace settings"}</h2><p>{panel === "import" ? "Add endpoints from an OpenAPI JSON or YAML document." : panel === "run" ? "Validate the current request against an endpoint schema." : panel === "help" ? "Use the playground to check and repair request payloads." : panel === "notifications" ? "Recent workspace activity and alerts." : "Your current workspace profile and preferences."}</p></div><button className="modal-close" aria-label="Close dialog" onClick={() => setPanel(null)}><X size={17}/></button></div>
      {panel === "import" && <div className="modal-content"><button className="dropzone" onClick={() => fileInput.current?.click()} disabled={importBusy}><CloudUpload size={24}/><strong>{importBusy ? "Importing specification…" : "Choose an OpenAPI file"}</strong><span>JSON, YAML, or YML · up to 5 MB</span></button><p className="modal-hint">The API spec is parsed for endpoint summaries. Imported operations are added to this dashboard session.</p></div>}
      {panel === "run" && <div className="modal-content"><label className="form-label" htmlFor="run-endpoint">Endpoint</label><select id="run-endpoint" className="modal-select" value={`${selectedEndpoint.method} ${selectedEndpoint.path}`} onChange={(event) => { const endpoint = endpoints.find((item) => `${item.method} ${item.path}` === event.target.value); if (endpoint) selectEndpoint(endpoint); }}>{endpoints.map((endpoint) => <option key={endpoint.method + endpoint.path}>{endpoint.method} {endpoint.path}</option>)}</select><div className="run-summary"><FlaskConical size={16}/><span>Run validates the current JSON body against the selected endpoint schema. No external HTTP request will be sent.</span></div><button className="button button-primary modal-primary" disabled={runBusy} onClick={createTestRun}><Play size={14} fill="currentColor"/>{runBusy ? "Running validation…" : "Run validation"}</button></div>}
      {panel === "help" && <div className="modal-content help-content"><div><b>1. Select an endpoint</b><span>Choose a row from the endpoint list to load its schema.</span></div><div><b>2. Edit the request body</b><span>Provide a JSON payload in the editor. Invalid JSON is reported before validation.</span></div><div><b>3. Validate or repair</b><span>Validation explains schema issues. Auto-fix suggests a schema-conforming payload; review it before use.</span></div></div>}
      {panel === "notifications" && <div className="modal-content help-content"><div><b>Workspace is ready</b><span>API Test AI backend is available for schema validation.</span></div><div><b>{runs.length} recent test runs</b><span>New validations appear in the activity list.</span></div><div><b>{endpoints.length} endpoints in this session</b><span>Import an OpenAPI spec to add more operations.</span></div></div>}
      {panel === "settings" && <div className="modal-content help-content"><div><b>Jamie Davis</b><span>jamie@acme.dev · Workspace member</span></div><div><b>Acme Engineering</b><span>Free plan · Demo workspace</span></div><div><b>Data note</b><span>Imported endpoints and test runs are currently kept in page memory only.</span></div></div>}
    </section></div>}
  </main>;
}
