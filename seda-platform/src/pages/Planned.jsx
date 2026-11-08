import React from 'react';
import { Hammer } from 'lucide-react';
import { useNav } from '../ui/kit.jsx';
import { PAGES } from '../ui/Layout.jsx';

const NOTES = {
  knowledge: 'Bank FAQ, product terms, fees and rates the assistant may answer from. Editable and versioned. If an answer is not here, Seda says “I don’t know” instead of guessing.',
  analytics: 'Most used commands, completion and drop-off per flow, recognition accuracy, time saved and Money Coach suggestions followed.',
  settings: 'Team and roles (Admin, Developer, Risk viewer), API keys, assistant name and voice, languages and branding.',
};

export default function Planned() {
  const { page } = useNav();
  return (
    <div className="sd-card" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
      <Hammer size={30} className="muted" />
      <h2 style={{ fontSize: 20 }}>{PAGES[page][0]} is planned for the next build</h2>
      <p className="muted" style={{ maxWidth: '60ch', lineHeight: 1.55 }}>{NOTES[page] || 'This section is being built right now.'}</p>
    </div>
  );
}
