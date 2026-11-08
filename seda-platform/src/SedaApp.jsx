import React from 'react';
import { useSeda } from './seda/store.jsx';
import { NavProvider, useNav } from './ui/kit.jsx';
import Layout from './ui/Layout.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Playground from './pages/Playground.jsx';
import Traces from './pages/Traces.jsx';
import Planned from './pages/Planned.jsx';
import * as Extra from './pages/registry.js';

const PAGE = { overview: Overview, playground: Playground, traces: Traces, ...Extra.default };

function Router() {
  const { page } = useNav();
  const C = PAGE[page] || Planned;
  return <Layout><C /></Layout>;
}

export default function SedaApp() {
  const { state } = useSeda();
  if (!state.user) return <Login />;
  return <NavProvider><Router /></NavProvider>;
}
