// Route table. Every screen in the app is listed here.
import React from 'react';
import { Hammer } from 'lucide-react';
import Home from './Home.jsx';
import History, { TxDetail, Analytics } from './History.jsx';
import { Header, Empty } from '../components/ui.jsx';
import extra from './registry.js';

const Soon = (title) => function SoonScreen() {
  return (
    <main className="screen no-tabs">
      <Header title={title} />
      <Empty icon={<Hammer size={28} />} title="Being built right now" sub="This screen arrives in the next update." />
    </main>
  );
};


const stub = (path, title) => [path, Soon(title)];

const base = [
  ['/', Home],
  ['/history', History],
  ['/history/:id', TxDetail],
  ['/analytics', Analytics],
];

const planned = [
  stub('/payments', 'Payments'), stub('/payments/:id', 'Payment'),
  stub('/transfers', 'Transfers'), stub('/transfers/card', 'To card'), stub('/transfers/phone', 'By phone'), stub('/transfers/own', 'Between my accounts'), stub('/transfers/abroad', 'International'),
  stub('/cards', 'Cards'), stub('/cards/new', 'New card'), stub('/cards/:id', 'Card'),
  stub('/qr', 'QR payments'), stub('/more', 'More'), stub('/notifications', 'Notifications'), stub('/profile', 'Profile'),
  stub('/cashback', 'Cashback'), stub('/loans', 'Loans'), stub('/loans/apply', 'Loan application'), stub('/deposits', 'Deposits'), stub('/deposits/new', 'New deposit'),
  stub('/exchange', 'Exchange'), stub('/security', 'Security'), stub('/settings', 'Settings'), stub('/branches', 'Branches & ATMs'), stub('/support', 'Support'), stub('/receipt/:id', 'Receipt'),
];

const have = new Set([...base, ...extra].map(([p]) => p));
export const SCREENS = [...base, ...extra, ...planned.filter(([p]) => !have.has(p))];
