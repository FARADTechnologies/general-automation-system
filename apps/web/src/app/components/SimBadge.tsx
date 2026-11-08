// Fixed label on every investment screen: prices are simulated and nothing is advice (I12).
import React from 'react';
import '../../styles/invest.css';
export default function SimBadge() {
  return <span className="sim-badge" data-nav-id="invest-sim-label">Simulated market data</span>;
}
