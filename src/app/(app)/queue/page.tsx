import { auth } from '../../../../auth';
import { listMeetingsToday, listMeetingsTomorrow } from '@/lib/meetings/service';
import { MeetingsQueue } from '@/components/queue/MeetingsQueue';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const session = await auth();
  const email = session?.user?.email ?? '';
  const today = await listMeetingsToday(email);
  const tomorrow = await listMeetingsTomorrow(email);
  return (
    <MeetingsQueue
      today={today}
      tomorrow={tomorrow}
      sdrName={session?.user?.name ?? email}
    />
  );
}
