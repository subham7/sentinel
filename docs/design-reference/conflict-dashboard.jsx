import { useState, useEffect, useRef, useCallback } from "react";

const FONT = "'Share Tech Mono', monospace";
const COLORS = {
  bg: "#060809",
  panel: "#0b0f12",
  border: "#1a2a1a",
  green: "#00e676",
  greenDim: "#00662e",
  amber: "#ffab00",
  red: "#ff1744",
  blue: "#00b0ff",
  text: "#b0c4b0",
  textDim: "#4a6a4a",
  white: "#e8f5e9",
};

// Middle East SVG coordinates (simplified)
const COUNTRIES = [
  { id: "iran", name: "IRAN", path: "M 420,120 L 480,100 L 540,110 L 570,140 L 580,180 L 560,220 L 520,250 L 480,260 L 440,240 L 410,210 L 400,170 Z", fill: "#1a0a0a", stroke: "#ff1744" },
  { id: "iraq", name: "IRAQ", path: "M 320,130 L 390,120 L 420,120 L 410,210 L 380,230 L 340,220 L 310,190 L 300,160 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "saudi", name: "SAUDI ARABIA", path: "M 280,220 L 340,220 L 380,230 L 410,210 L 440,240 L 450,290 L 430,360 L 380,380 L 310,370 L 270,330 L 260,280 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "uae", name: "UAE", path: "M 480,260 L 520,250 L 540,270 L 530,300 L 500,310 L 475,290 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "qatar", name: "QATAR", path: "M 450,290 L 470,285 L 475,300 L 460,310 L 450,300 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "kuwait", name: "KUWAIT", path: "M 380,190 L 400,185 L 405,200 L 390,210 L 378,205 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "oman", name: "OMAN", path: "M 520,250 L 580,180 L 620,220 L 610,280 L 580,320 L 540,340 L 530,300 L 540,270 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "yemen", name: "YEMEN", path: "M 310,370 L 380,380 L 430,360 L 450,380 L 430,420 L 350,430 L 290,410 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "turkey", name: "TURKEY", path: "M 260,60 L 380,50 L 420,70 L 420,100 L 390,120 L 320,130 L 270,110 L 250,85 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "syria", name: "SYRIA", path: "M 320,100 L 390,90 L 420,100 L 420,120 L 390,120 L 320,130 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "jordan", name: "JORDAN", path: "M 300,140 L 320,130 L 320,140 L 310,190 L 285,200 L 280,165 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "israel", name: "ISRAEL", path: "M 282,138 L 296,135 L 298,155 L 285,160 L 281,148 Z", fill: "#0a0f0a", stroke: "#00b0ff" },
  { id: "egypt", name: "EGYPT", path: "M 200,140 L 280,130 L 285,200 L 260,280 L 210,280 L 195,200 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
  { id: "pakistan", name: "PAKISTAN", path: "M 580,100 L 660,90 L 690,130 L 680,180 L 640,200 L 580,180 L 570,140 Z", fill: "#0a0f0a", stroke: "#1a2a1a" },
];

const BASES = [
  { id: "al_udeid", name: "Al Udeid AB", x: 455, y: 292, type: "US", country: "Qatar" },
  { id: "al_dhafra", name: "Al Dhafra AB", x: 505, y: 285, type: "US", country: "UAE" },
  { id: "fifth_fleet", name: "5th Fleet HQ", x: 445, y: 305, type: "US", country: "Bahrain" },
  { id: "incirlik", name: "Incirlik AB", x: 315, y: 72, type: "NATO", country: "Turkey" },
  { id: "tehran", name: "Tehran", x: 490, y: 145, type: "IR", country: "Iran" },
  { id: "isfahan", name: "Isfahan AB", x: 490, y: 185, type: "IR", country: "Iran" },
  { id: "bandar", name: "Bandar Abbas", x: 530, y: 255, type: "IR", country: "Iran" },
  { id: "bushehr", name: "Bushehr", x: 465, y: 225, type: "IR", country: "Iran" },
];

const INCIDENT_TEMPLATES = [
  { type: "AIRSPACE", sev: "WARN", msg: "Iranian F-14 intercept near Strait of Hormuz", loc: "Persian Gulf" },
  { type: "NAVAL", sev: "HIGH", msg: "IRGC fast boat swarm detected near USS {ship}", loc: "Strait of Hormuz" },
  { type: "CYBER", sev: "WARN", msg: "Anomalous network activity on SCADA systems", loc: "Natanz, Iran" },
  { type: "MISSILE", sev: "CRIT", msg: "Ballistic missile launch detected from western Iran", loc: "Kermanshah Province" },
  { type: "INTEL", sev: "INFO", msg: "Commercial satellite imagery shows increased activity at Fordow facility", loc: "Fordow, Iran" },
  { type: "DRONE", sev: "HIGH", msg: "Shahed-136 drone swarm detected heading southwest", loc: "Iraq-Iran border" },
  { type: "DIPLOM", sev: "INFO", msg: "IAEA inspectors denied access to Natanz enrichment site", loc: "Vienna / Tehran" },
  { type: "ECON", sev: "WARN", msg: "Iranian oil tanker detected disabling AIS transponder", loc: "Gulf of Oman" },
  { type: "AIRSPACE", sev: "INFO", msg: "US E-8C JSTARS detected over eastern Saudi Arabia", loc: "Saudi Arabia" },
  { type: "NAVAL", sev: "WARN", msg: "Iranian submarine departed Bandar Abbas naval base", loc: "Bandar Abbas" },
  { type: "PROXY", sev: "HIGH", msg: "Hezbollah rocket barrage from southern Lebanon", loc: "Northern Israel" },
  { type: "NUCLEAR", sev: "CRIT", msg: "Enrichment levels at Fordow exceed 60% threshold", loc: "Fordow, Iran" },
  { type: "INTEL", sev: "INFO", msg: "US B-52H bombers depart Diego Garcia on patrol mission", loc: "Indian Ocean" },
  { type: "AIRSPACE", sev: "WARN", msg: "Iranian air defense radar tracking detected, high emission", loc: "Bushehr Province" },
  { type: "ECON", sev: "INFO", msg: "Brent crude spike +4.2% on strait closure fears", loc: "Global Markets" },
];

const SHIPS = ["USS Abraham Lincoln", "USS Bataan", "USS Laboon", "USS Carney", "USS Gerald Ford"];
const AIRCRAFT_TYPES = ["F-22A", "F-35A", "B-52H", "KC-135", "E-3 Sentry", "RQ-4 Global Hawk", "MQ-9 Reaper", "P-8 Poseidon", "RC-135V", "F-16C"];
const IR_AIRCRAFT = ["F-14A", "Su-35", "MiG-29", "F-4E", "Shahed-129", "Mohajer-6", "F-7M"];

function generateAircraft(id, side) {
  const isUS = side === "US";
  const types = isUS ? AIRCRAFT_TYPES : IR_AIRCRAFT;
  const type = types[Math.floor(Math.random() * types.length)];

  const startBase = isUS
    ? BASES.filter(b => b.type === "US")[Math.floor(Math.random() * 3)]
    : BASES.filter(b => b.type === "IR")[Math.floor(Math.random() * 4)];

  // random direction
  const angle = Math.random() * Math.PI * 2;
  return {
    id,
    callsign: isUS
      ? `${["HAWK", "EAGLE", "VIPER", "GHOST", "BONE"][Math.floor(Math.random() * 5)]}${Math.floor(10 + Math.random() * 89)}`
      : `IR-${Math.floor(100 + Math.random() * 900)}`,
    type,
    side,
    x: startBase.x + (Math.random() - 0.5) * 60,
    y: startBase.y + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    alt: Math.floor(15000 + Math.random() * 45000),
    speed: Math.floor(300 + Math.random() * 900),
    trail: [],
    active: true,
  };
}

function initAircraft() {
  const craft = [];
  for (let i = 0; i < 8; i++) craft.push(generateAircraft(`us-${i}`, "US"));
  for (let i = 0; i < 6; i++) craft.push(generateAircraft(`ir-${i}`, "IR"));
  return craft;
}

function getSevColor(sev) {
  return { CRIT: COLORS.red, HIGH: "#ff6d00", WARN: COLORS.amber, INFO: COLORS.green }[sev] || COLORS.text;
}

export default function Dashboard() {
  const [aircraft, setAircraft] = useState(initAircraft);
  const [incidents, setIncidents] = useState([]);
  const [threatLevel, setThreatLevel] = useState(3);
  const [oilPrice, setOilPrice] = useState(88.42);
  const [time, setTime] = useState(new Date());
  const [selectedAC, setSelectedAC] = useState(null);
  const [incidentCount, setIncidentCount] = useState({ CRIT: 0, HIGH: 2, WARN: 4, INFO: 8 });
  const [activeZone, setActiveZone] = useState("PERSIAN GULF");
  const tickRef = useRef(0);
  const mapW = 750, mapH = 500;

  // Tick
  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current++;
      setTime(new Date());

      // Move aircraft
      setAircraft(prev => prev.map(ac => {
        const newX = ac.x + ac.vx + (Math.random() - 0.5) * 0.3;
        const newY = ac.y + ac.vy + (Math.random() - 0.5) * 0.3;
        // Bounce off edges
        let vx = ac.vx, vy = ac.vy;
        if (newX < 180 || newX > 700) vx *= -1;
        if (newY < 40 || newY > 460) vy *= -1;
        const trail = [...(ac.trail || []), { x: ac.x, y: ac.y }].slice(-12);
        return { ...ac, x: newX, y: newY, vx, vy, trail };
      }));

      // Oil price fluctuation
      setOilPrice(p => Math.max(70, Math.min(130, p + (Math.random() - 0.48) * 0.4)));

      // Random incident
      if (tickRef.current % 8 === 0) {
        const tmpl = INCIDENT_TEMPLATES[Math.floor(Math.random() * INCIDENT_TEMPLATES.length)];
        const msg = tmpl.msg.replace("{ship}", SHIPS[Math.floor(Math.random() * SHIPS.length)]);
        const incident = {
          id: Date.now(),
          time: new Date(),
          type: tmpl.type,
          sev: tmpl.sev,
          msg,
          loc: tmpl.loc,
          new: true,
        };
        setIncidents(prev => [incident, ...prev].slice(0, 40));
        setIncidentCount(prev => ({ ...prev, [tmpl.sev]: (prev[tmpl.sev] || 0) + 1 }));
      }

      // Threat fluctuation
      if (tickRef.current % 30 === 0) {
        setThreatLevel(Math.floor(2 + Math.random() * 3));
      }
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const threatLabels = ["", "LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"];
  const threatColors = ["", COLORS.green, "#69f0ae", COLORS.amber, "#ff6d00", COLORS.red];

  return (
    <div style={{
      fontFamily: FONT,
      background: COLORS.bg,
      color: COLORS.text,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      userSelect: "none",
    }}>
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #060809; }
        ::-webkit-scrollbar-thumb { background: #1a3a1a; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.2} }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.6);opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        .ac-dot { cursor: pointer; transition: r 0.2s; }
        .ac-dot:hover { r: 5; }
      `}</style>

      {/* CLASSIFICATION BANNER */}
      <div style={{ background: COLORS.red, color: "#fff", textAlign: "center", fontSize: 11, padding: "2px 0", letterSpacing: 4, fontFamily: "'Orbitron', monospace", fontWeight: 700 }}>
        ██ UNCLASSIFIED // FOR DEMONSTRATION PURPOSES ONLY // SIMULATED DATA ██
      </div>

      {/* HEADER */}
      <div style={{
        background: "linear-gradient(90deg, #060809 0%, #0b1a0b 50%, #060809 100%)",
        borderBottom: `1px solid ${COLORS.greenDim}`,
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 18, fontWeight: 900, color: COLORS.green, letterSpacing: 3 }}>
            ◈ SENTINEL
          </div>
          <div style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 2 }}>
            GEOSPATIAL INTELLIGENCE OPERATIONS // US-IRAN THEATER
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: COLORS.textDim, letterSpacing: 2 }}>THREAT LEVEL</div>
            <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 13, fontWeight: 700, color: threatColors[threatLevel], animation: threatLevel >= 4 ? "blink 1s infinite" : "none" }}>
              {threatLabels[threatLevel]}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: COLORS.greenDim }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: COLORS.textDim, letterSpacing: 2 }}>BRENT CRUDE</div>
            <div style={{ fontSize: 13, color: oilPrice > 95 ? COLORS.red : COLORS.amber, fontFamily: "'Orbitron', monospace" }}>
              ${oilPrice.toFixed(2)}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: COLORS.greenDim }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: COLORS.textDim, letterSpacing: 2 }}>ZULU TIME</div>
            <div style={{ fontSize: 13, color: COLORS.green, fontFamily: "'Orbitron', monospace" }}>
              {time.toUTCString().split(" ")[4]}Z
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: COLORS.greenDim }} />
          <div style={{ display: "flex", gap: 8 }}>
            {Object.entries(incidentCount).map(([k, v]) => (
              <div key={k} style={{ textAlign: "center", padding: "2px 8px", border: `1px solid ${getSevColor(k)}22`, borderRadius: 2 }}>
                <div style={{ fontSize: 9, color: getSevColor(k), letterSpacing: 1 }}>{k}</div>
                <div style={{ fontSize: 14, color: getSevColor(k), fontFamily: "'Orbitron', monospace", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 1, background: "#0a0a0a" }}>

        {/* LEFT PANEL - Aircraft List */}
        <div style={{ width: 230, background: COLORS.panel, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: COLORS.green, letterSpacing: 2 }}>AIR TRACKS</span>
            <span style={{ fontSize: 10, color: COLORS.textDim }}>{aircraft.length} ACTIVE</span>
          </div>
          {/* Legend */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 12 }}>
            <span style={{ fontSize: 9, color: COLORS.blue }}>▲ US/ALLIED</span>
            <span style={{ fontSize: 9, color: COLORS.red }}>▲ IRANIAN</span>
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {aircraft.map(ac => (
              <div key={ac.id}
                onClick={() => setSelectedAC(selectedAC?.id === ac.id ? null : ac)}
                style={{
                  padding: "5px 12px",
                  borderBottom: `1px solid ${COLORS.border}22`,
                  cursor: "pointer",
                  background: selectedAC?.id === ac.id ? "#0d1f0d" : "transparent",
                  borderLeft: selectedAC?.id === ac.id ? `2px solid ${COLORS.green}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: ac.side === "US" ? COLORS.blue : COLORS.red, fontWeight: 700 }}>
                    {ac.callsign}
                  </span>
                  <span style={{ fontSize: 9, color: COLORS.textDim }}>{ac.type}</span>
                </div>
                <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 1 }}>
                  ALT {(ac.alt).toLocaleString()}ft · {ac.speed}kts
                </div>
              </div>
            ))}
          </div>

          {/* Selected AC details */}
          {selectedAC && (
            <div style={{ borderTop: `1px solid ${COLORS.greenDim}`, padding: 12, background: "#0a1a0a" }}>
              <div style={{ fontSize: 10, color: COLORS.green, letterSpacing: 2, marginBottom: 8 }}>TRACK DETAIL</div>
              {[
                ["CALLSIGN", selectedAC.callsign],
                ["TYPE", selectedAC.type],
                ["SIDE", selectedAC.side === "US" ? "US/ALLIED" : "IRANIAN"],
                ["ALTITUDE", `${selectedAC.alt.toLocaleString()} ft`],
                ["SPEED", `${selectedAC.speed} kts`],
                ["COORD", `${(selectedAC.x * 0.05 + 42).toFixed(2)}°E ${(selectedAC.y * -0.04 + 38).toFixed(2)}°N`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: COLORS.textDim }}>{k}</span>
                  <span style={{ fontSize: 9, color: COLORS.white }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CENTER - Map */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {/* Map toolbar */}
          <div style={{ background: COLORS.panel, borderBottom: `1px solid ${COLORS.border}`, padding: "5px 12px", display: "flex", gap: 16, alignItems: "center" }}>
            {["PERSIAN GULF", "STRAIT OF HORMUZ", "RED SEA", "LEVANT"].map(z => (
              <button key={z} onClick={() => setActiveZone(z)} style={{
                background: activeZone === z ? COLORS.greenDim : "transparent",
                border: `1px solid ${activeZone === z ? COLORS.green : COLORS.border}`,
                color: activeZone === z ? COLORS.green : COLORS.textDim,
                padding: "2px 10px", fontSize: 9, cursor: "pointer", fontFamily: FONT, letterSpacing: 1, borderRadius: 2
              }}>{z}</button>
            ))}
            <div style={{ marginLeft: "auto", fontSize: 9, color: COLORS.textDim }}>
              LAYER: ADS-B · AIS · SENTINEL-2 · ACLED
            </div>
          </div>

          {/* SVG Map */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#080e0a" }}>
            {/* Scanline effect */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 10,
              background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,230,118,0.012) 2px, rgba(0,230,118,0.012) 4px)",
            }} />

            <svg width="100%" height="100%" viewBox={`0 0 ${mapW} ${mapH}`} style={{ display: "block" }}>
              {/* Ocean */}
              <rect width={mapW} height={mapH} fill="#05100a" />

              {/* Grid lines */}
              {Array.from({ length: 15 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 35} x2={mapW} y2={i * 35} stroke="#0d1a0d" strokeWidth={0.5} />
              ))}
              {Array.from({ length: 22 }, (_, i) => (
                <line key={`v${i}`} x1={i * 35} y1={0} x2={i * 35} y2={mapH} stroke="#0d1a0d" strokeWidth={0.5} />
              ))}

              {/* Countries */}
              {COUNTRIES.map(c => (
                <g key={c.id}>
                  <path d={c.path} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
                  <text x={0} y={0} style={{ fontSize: 7, fill: COLORS.textDim, letterSpacing: 1 }}>
                    {/* Country labels added inline via centroid approximation */}
                  </text>
                </g>
              ))}

              {/* Country labels */}
              <text x={490} y={175} fontSize={8} fill="#ff4444" letterSpacing={2} textAnchor="middle" fontFamily={FONT}>IRAN</text>
              <text x={352} y={175} fontSize={7} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>IRAQ</text>
              <text x={330} y={310} fontSize={7} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>SAUDI ARABIA</text>
              <text x={284} y={155} fontSize={6} fill={COLORS.blue} textAnchor="middle" fontFamily={FONT}>ISR</text>
              <text x={235} y={210} fontSize={7} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>EGYPT</text>
              <text x={625} y={240} fontSize={7} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>OMAN</text>
              <text x={630} y={135} fontSize={7} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>PAKISTAN</text>
              <text x={330} y={80} fontSize={7} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>TURKEY</text>

              {/* Strait of Hormuz label */}
              <text x={542} y={272} fontSize={7} fill={COLORS.amber} letterSpacing={1} fontFamily={FONT} opacity={0.8}>STRAIT OF HORMUZ</text>
              <line x1={520} y1={270} x2={560} y2={268} stroke={COLORS.amber} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />

              {/* Persian Gulf label */}
              <text x={430} y={260} fontSize={7} fill="#1a6a6a" letterSpacing={1} fontFamily={FONT}>PERSIAN GULF</text>

              {/* Red Sea */}
              <text x={240} y={310} fontSize={7} fill="#1a4a6a" letterSpacing={1} fontFamily={FONT} transform="rotate(-65, 240, 310)">RED SEA</text>

              {/* Aircraft trails */}
              {aircraft.map(ac => (
                ac.trail.length > 1 && (
                  <polyline
                    key={`trail-${ac.id}`}
                    points={[...ac.trail, { x: ac.x, y: ac.y }].map(p => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={ac.side === "US" ? COLORS.blue : COLORS.red}
                    strokeWidth={0.8}
                    opacity={0.35}
                    strokeDasharray="3,2"
                  />
                )
              ))}

              {/* Aircraft dots */}
              {aircraft.map(ac => (
                <g key={`ac-${ac.id}`} onClick={() => setSelectedAC(selectedAC?.id === ac.id ? null : ac)} style={{ cursor: "pointer" }}>
                  {/* Selection ring */}
                  {selectedAC?.id === ac.id && (
                    <circle cx={ac.x} cy={ac.y} r={12} fill="none" stroke={COLORS.green} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.7} style={{ animation: "pulse 2s infinite" }} />
                  )}
                  {/* Pulse ring */}
                  <circle cx={ac.x} cy={ac.y} r={7} fill="none"
                    stroke={ac.side === "US" ? COLORS.blue : COLORS.red}
                    strokeWidth={0.5} opacity={0.3} />
                  {/* Aircraft marker - triangle */}
                  <polygon
                    points={`${ac.x},${ac.y - 5} ${ac.x - 4},${ac.y + 3} ${ac.x + 4},${ac.y + 3}`}
                    fill={ac.side === "US" ? COLORS.blue : COLORS.red}
                    opacity={0.9}
                  />
                  {/* Callsign */}
                  <text x={ac.x + 6} y={ac.y - 4} fontSize={7} fill={ac.side === "US" ? COLORS.blue : COLORS.red} fontFamily={FONT} opacity={0.8}>
                    {ac.callsign}
                  </text>
                </g>
              ))}

              {/* Bases */}
              {BASES.map(b => (
                <g key={b.id}>
                  <rect x={b.x - 4} y={b.y - 4} width={8} height={8}
                    fill="none"
                    stroke={b.type === "US" ? COLORS.blue : b.type === "NATO" ? "#aa00ff" : COLORS.red}
                    strokeWidth={1.2}
                    transform={`rotate(45, ${b.x}, ${b.y})`}
                  />
                  <circle cx={b.x} cy={b.y} r={1.5}
                    fill={b.type === "US" ? COLORS.blue : b.type === "NATO" ? "#aa00ff" : COLORS.red}
                  />
                  <text x={b.x + 7} y={b.y + 3} fontSize={6.5} fill={b.type === "US" ? COLORS.blue : b.type === "NATO" ? "#aa00ff" : "#ff6666"} fontFamily={FONT}>
                    {b.name}
                  </text>
                </g>
              ))}

              {/* Active zone highlight */}
              {activeZone === "PERSIAN GULF" && (
                <ellipse cx={450} cy={250} rx={80} ry={40} fill="none" stroke={COLORS.amber} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.4} />
              )}
              {activeZone === "STRAIT OF HORMUZ" && (
                <ellipse cx={535} cy={268} rx={35} ry={18} fill="none" stroke={COLORS.amber} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.4} />
              )}

              {/* Legend */}
              <g transform="translate(12, 380)">
                <rect x={0} y={0} width={140} height={90} fill="#060809" stroke={COLORS.border} strokeWidth={0.8} opacity={0.9} />
                <text x={8} y={14} fontSize={8} fill={COLORS.green} fontFamily={FONT} letterSpacing={2}>LEGEND</text>
                <polygon points="14,24 10,32 18,32" fill={COLORS.blue} /><text x={24} y={32} fontSize={7} fill={COLORS.blue} fontFamily={FONT}>US/ALLIED AIRCRAFT</text>
                <polygon points="14,38 10,46 18,46" fill={COLORS.red} /><text x={24} y={46} fontSize={7} fill={COLORS.red} fontFamily={FONT}>IRANIAN AIRCRAFT</text>
                <rect x={9} y={51} width={8} height={8} fill="none" stroke={COLORS.blue} strokeWidth={1} transform="rotate(45,13,55)" />
                <text x={24} y={59} fontSize={7} fill={COLORS.blue} fontFamily={FONT}>US/NATO BASE</text>
                <rect x={9} y={64} width={8} height={8} fill="none" stroke={COLORS.red} strokeWidth={1} transform="rotate(45,13,68)" />
                <text x={24} y={72} fontSize={7} fill={COLORS.red} fontFamily={FONT}>IRANIAN BASE</text>
                <line x1={9} y1={82} x2={22} y2={82} stroke={COLORS.amber} strokeDasharray="3,2" /><text x={28} y={85} fontSize={7} fill={COLORS.amber} fontFamily={FONT}>ACTIVE ZONE</text>
              </g>

              {/* Compass rose */}
              <g transform="translate(700, 460)">
                <text x={0} y={-14} fontSize={8} fill={COLORS.textDim} textAnchor="middle" fontFamily={FONT}>N</text>
                <line x1={0} y1={-12} x2={0} y2={12} stroke={COLORS.textDim} strokeWidth={0.8} />
                <line x1={-12} y1={0} x2={12} y2={0} stroke={COLORS.textDim} strokeWidth={0.8} />
                <circle cx={0} cy={0} r={12} fill="none" stroke={COLORS.textDim} strokeWidth={0.5} />
              </g>
            </svg>
          </div>

          {/* Bottom status bar */}
          <div style={{ background: COLORS.panel, borderTop: `1px solid ${COLORS.border}`, padding: "4px 12px", display: "flex", gap: 24, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: COLORS.textDim }}>DATA SOURCES:</span>
            {["ADS-B EXCHANGE", "OPENSKY", "MARINETRAFFIC", "GDELT", "ACLED", "EIA"].map(s => (
              <span key={s} style={{ fontSize: 9, color: COLORS.greenDim, letterSpacing: 1 }}>
                <span style={{ color: COLORS.green, animation: "blink 2s infinite" }}>●</span> {s}
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 9, color: COLORS.textDim }}>
              REFRESH: 1.2s · TRACKS: {aircraft.length} · LAT: 26.4°N LON: 56.3°E
            </span>
          </div>
        </div>

        {/* RIGHT PANEL - Incident Feed */}
        <div style={{ width: 300, background: COLORS.panel, borderLeft: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: COLORS.green, letterSpacing: 2 }}>LIVE INCIDENT FEED</span>
            <span style={{ fontSize: 10, color: COLORS.red, animation: "blink 1s infinite" }}>● LIVE</span>
          </div>

          {/* Metrics row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#0a0a0a", borderBottom: `1px solid ${COLORS.border}` }}>
            {[
              { label: "US AIRCRAFT", value: aircraft.filter(a => a.side === "US").length, color: COLORS.blue },
              { label: "IR AIRCRAFT", value: aircraft.filter(a => a.side === "IR").length, color: COLORS.red },
              { label: "ENRICHMENT", value: "84%", color: COLORS.red },
              { label: "STRAIT STATUS", value: "TENSE", color: COLORS.amber },
            ].map(m => (
              <div key={m.label} style={{ padding: "8px 12px", background: COLORS.panel }}>
                <div style={{ fontSize: 8, color: COLORS.textDim, letterSpacing: 1 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontFamily: "'Orbitron', monospace", fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Oil price mini chart */}
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 9, color: COLORS.textDim, marginBottom: 4, letterSpacing: 1 }}>BRENT CRUDE (SIMULATED) · 24H</div>
            <MiniChart price={oilPrice} />
          </div>

          {/* Incidents */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {incidents.map((inc, i) => (
              <div key={inc.id} style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${COLORS.border}22`,
                borderLeft: `2px solid ${getSevColor(inc.sev)}`,
                animation: i === 0 ? "fadeIn 0.3s ease" : "none",
                background: i === 0 ? `${getSevColor(inc.sev)}08` : "transparent",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 8, color: getSevColor(inc.sev), letterSpacing: 1, fontWeight: 700 }}>
                    [{inc.sev}] {inc.type}
                  </span>
                  <span style={{ fontSize: 8, color: COLORS.textDim }}>
                    {inc.time.toUTCString().split(" ")[4]}Z
                  </span>
                </div>
                <div style={{ fontSize: 10, color: COLORS.white, lineHeight: 1.4, marginBottom: 2 }}>{inc.msg}</div>
                <div style={{ fontSize: 8, color: COLORS.textDim }}>📍 {inc.loc}</div>
              </div>
            ))}
            {incidents.length === 0 && (
              <div style={{ padding: 20, color: COLORS.textDim, fontSize: 10, textAlign: "center" }}>
                AWAITING EVENTS...
              </div>
            )}
          </div>

          {/* IAEA Nuclear status */}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: 12, background: "#0d0808" }}>
            <div style={{ fontSize: 9, color: COLORS.amber, letterSpacing: 2, marginBottom: 8 }}>◈ NUCLEAR WATCH</div>
            {[
              { site: "Natanz", status: "ENRICHING 60%", color: COLORS.red },
              { site: "Fordow", status: "ENRICHING 84%", color: COLORS.red },
              { site: "Arak", status: "UNDER IAEA SEAL", color: COLORS.amber },
              { site: "Bushehr", status: "OPERATIONAL", color: COLORS.amber },
            ].map(n => (
              <div key={n.site} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: COLORS.textDim }}>{n.site}</span>
                <span style={{ fontSize: 9, color: n.color, letterSpacing: 0.5 }}>{n.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mini sparkline chart
function MiniChart({ price }) {
  const [history, setHistory] = useState(() => {
    const base = 88;
    return Array.from({ length: 50 }, (_, i) => base + Math.sin(i * 0.3) * 3 + Math.random() * 2);
  });

  useEffect(() => {
    setHistory(prev => [...prev.slice(-49), price]);
  }, [price]);

  const min = Math.min(...history) - 1;
  const max = Math.max(...history) + 1;
  const w = 276, h = 40;
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  }).join(" ");

  const lastY = h - ((history[history.length - 1] - min) / (max - min)) * h;
  const color = price > 92 ? COLORS.red : price > 88 ? COLORS.amber : COLORS.green;

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.2} opacity={0.8} />
      <circle cx={w} cy={lastY} r={2.5} fill={color} />
      <line x1={0} y1={lastY} x2={w} y2={lastY} stroke={color} strokeWidth={0.4} strokeDasharray="3,3" opacity={0.3} />
    </svg>
  );
}
