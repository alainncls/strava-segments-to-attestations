import React, { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout/Layout';
import { useInsights } from '@/hooks/useInsights';
import { StravaAuthProvider } from '@/hooks/StravaAuthProvider';

const Hub = lazy(() => import('@/screens/Hub/Hub'));
const Attestations = lazy(() => import('@/screens/Attestations/Attestations'));
const StravaCallback = lazy(() => import('@/screens/StravaCallback/StravaCallback'));
const About = lazy(() => import('@/screens/About/About'));
const Heatmap = lazy(() => import('@/screens/Heatmap/Heatmap'));
const NotFound = lazy(() => import('@/screens/NotFound/NotFound'));

function App(): React.JSX.Element {
  useInsights();

  return (
    <StravaAuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Hub />} />
          <Route path="/attestations" element={<Attestations />} />
          <Route path="/oauth" element={<StravaCallback />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </StravaAuthProvider>
  );
}

export default App;
