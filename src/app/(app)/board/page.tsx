import { getBoardLeads } from '@/lib/leads/read';
import { Board } from '@/components/kanban/Board';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const leads = await getBoardLeads();
  return <Board initialLeads={leads} />;
}
