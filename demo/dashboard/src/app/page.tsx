import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Dashboard from '@/components/Dashboard';

export default function Page() {
  return (
    <>
      <Nav />
      <main id="main" className="pt-[60px]">
        <Dashboard />
      </main>
      <Footer />
    </>
  );
}
