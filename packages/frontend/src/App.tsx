import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Home from './screens/Home/Home';
import StravaCallback from './screens/StravaCallback/StravaCallback';
import About from './screens/About/About';
import { useInsights } from './hooks/useInsights';

function App(): React.JSX.Element {
  useInsights();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/oauth" element={<StravaCallback />} />
      <Route path="/about" element={<About />} />
    </Routes>
  );
}

export default App;
