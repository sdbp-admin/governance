"use client";

export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return <span className="help-tip">
    <button type="button" className="help-tip-button" aria-label={label}>?</button>
    <span className="help-tip-panel" role="tooltip">{children}</span>
  </span>;
}

export function CompassModal({ onClose, onPassword }: { onClose: () => void; onPassword?: () => void }) {
  return <div className="modal-backdrop compass-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="compass-modal" role="dialog" aria-modal="true" aria-labelledby="compass-title">
      <div className="editor-head">
        <div><span className="section-kicker">SDBP Compass</span><h2 id="compass-title">How we keep work moving</h2></div>
        <button className="quiet editor-close" type="button" onClick={onClose} aria-label="Close Compass">×</button>
      </div>

      <div className="compass-grid">
        <section><h3>Start with what needs you</h3><p><strong>My Attention</strong> shows the commitments, updates or tensions that currently need your response. Start with the item that creates the most movement.</p></section>
        <section><h3>Keep work visible</h3><p><strong>Work</strong> contains projects and concrete actions. Keep the current state short and factual. The app is not asking for reports.</p></section>
        <section><h3>Raise tensions early</h3><p>A tension is a gap between current reality and a potential future you sense. It can be a problem, opportunity, missing clarity or something blocking the work. You do not need the solution before raising it.</p></section>
        <section><h3>Change structure deliberately</h3><p><strong>Governance</strong> is for ongoing roles, responsibilities, authority and standing ways of working. A better idea is not automatically an objection; an objection identifies concrete harm or loss of capacity.</p></section>
        <section><h3>Projects form temporary teams</h3><p>People can work together around a project without creating a permanent organisational structure. Project groups remain visible for as long as the project is active.</p></section>
        <section><h3>Records keep memory</h3><p>Approved minutes, statutes and accepted governance belong in <strong>Records</strong>. The minutes are the record; the app does not reinterpret them into tasks.</p></section>
      </div>

      <div className="compass-principle">
        <strong>The app makes organisational reality visible. It does not run the organisation.</strong>
        <p>People still make commitments, have conversations, exercise judgement and do the work.</p>
      </div>

      <div className="compass-account">
        <div><h3>Your account</h3><p>Use the email address you were invited with. If you forget your password, use the reset link on the sign-in screen.</p></div>
        {onPassword && <button className="secondary" type="button" onClick={onPassword}>Change password</button>}
      </div>
    </section>
  </div>;
}
