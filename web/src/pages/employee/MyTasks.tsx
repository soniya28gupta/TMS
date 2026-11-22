import { PageHeader } from '../../components/Layout';
import { TaskListView } from '../../components/TaskListView';
import { useAuth } from '../../lib/auth';

export default function MyTasks() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Everything assigned to you. Open a task to update progress, add comments or raise a blocker."
      />
      <TaskListView basePath="/tasks" fixedAssigneeId={user.id} showAssignee={false} />
    </>
  );
}
