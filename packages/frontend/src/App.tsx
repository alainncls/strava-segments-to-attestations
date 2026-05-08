import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useInsights } from './hooks/useInsights';
import Loader from './components/Loader/Loader';

const Home = lazy(() => import('./screens/Home/Home'));
const StravaCallback = lazy(() => import('./screens/StravaCallback/StravaCallback'));
const About = lazy(() => import('./screens/About/About'));
const NotFound = lazy(() => import('./screens/NotFound/NotFound'));

function App(): React.JSX.Element {
  useInsights();

  return (
    <Suspense fallback={<Loader loading message="Loading page..." />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/oauth" element={<StravaCallback />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default App;
