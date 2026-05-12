const counters = [
  ["Orders today", "0"],
  ["Assigned LKW", "0"],
  ["Free LKW", "0"],
  ["Open orders", "0"],
  ["LKW usage", "0%"],
  ["Problems", "0"],
];

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal logistics</p>
          <h1>LKW Planning</h1>
        </div>
        <nav>
          <a href="#dashboard">Dashboard</a>
          <a href="#planning">Tagesplanung</a>
          <a href="#imports">Imports</a>
          <a href="#audit">Audit</a>
        </nav>
      </header>

      <section id="dashboard" className="dashboard">
        {counters.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section id="planning" className="planner">
        <div className="planner-header">
          <div>
            <h2>Tagesplanung</h2>
            <p>Excel-style planning view prepared for Orders-first and LKW-first modes.</p>
          </div>
          <div className="mode-switch">
            <button type="button">LKW-first</button>
            <button type="button">Orders-first</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>LKW</th>
              <th>LKW status</th>
              <th>Driver</th>
              <th>Chassis</th>
              <th>Runde</th>
              <th>Auftrag</th>
              <th>City</th>
              <th>Time</th>
              <th>Status</th>
              <th>Audit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={10}>No planning data loaded yet.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}

