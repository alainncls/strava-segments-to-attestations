import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Footer from '@/components/Footer/Footer';
import Header from '@/components/Header/Header';
import Loader from '@/components/Loader/Loader';

export default function Layout(): React.JSX.Element {
  return (
    <>
      <Header />
      <Suspense fallback={<Loader loading message="Loading…" />}>
        <Outlet />
      </Suspense>
      <Footer />
    </>
  );
}
