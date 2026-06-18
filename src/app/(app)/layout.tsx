import { Sidebar } from '@/components/layout/Sidebar';
import { Providers } from '../providers';
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect('/auth/signin');

  return (
    <Providers>
      <div className="flex h-screen w-screen flex-col overflow-hidden lg:flex-row">
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </Providers>
  );
}
