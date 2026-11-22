import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  Textarea,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Task } from '../../lib/types';

export default function ReviewQueue() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review Modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadQueue = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: Task[] }>('/tasks?status=SUBMITTED_FOR_REVIEW&pageSize=50');
      setTasks(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch review queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleReviewSubmit = async () => {
    if (!selectedTask || !reviewAction) return;
    try {
      setSubmitting(true);
      await api.post(`/tasks/${selectedTask.id}/review`, {
        action: reviewAction,
        notes: reviewNotes || undefined,
      });
      setSelectedTask(null);
      setReviewAction(null);
      setReviewNotes('');
      loadQueue();
    } catch (err: any) {
      alert(err.message || 'Failed to process review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Review Queue"
        description="Review tasks submitted by employees. Approve completed work or request changes with specific feedback."
      />

      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading tasks awaiting review..." />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="Review queue is empty"
            description="Great job! All employee task submissions have been reviewed and processed."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-slate-50">
                <div className="flex items-start gap-4">
                  <Avatar name={`${task.assignee?.firstName || ''} ${task.assignee?.lastName || ''}`} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-brand-600">{task.code}</span>
                      <Badge tone="bg-amber-100 text-amber-800 ring-amber-200">Awaiting Review</Badge>
                    </div>
                    <Link
                      to={`/admin/tasks/${task.id}`}
                      className="mt-0.5 block text-base font-semibold text-slate-900 hover:text-brand-600"
                    >
                      {task.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      Submitted by <strong className="text-slate-700">{task.assignee?.firstName} {task.assignee?.lastName}</strong> ({task.assignee?.employeeCode}) · Submitted on {formatDate(task.updatedAt)}
                    </p>
                    {task.description && (
                      <p className="mt-2 text-xs text-slate-600 line-clamp-2 max-w-2xl bg-slate-100 p-2.5 rounded">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      setSelectedTask(task);
                      setReviewAction('APPROVE');
                      setReviewNotes('Great work! Task approved.');
                    }}
                  >
                    ✓ Approve Completed
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setSelectedTask(task);
                      setReviewAction('REJECT');
                      setReviewNotes('');
                    }}
                  >
                    Request Changes
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Review Modal */}
      <Modal
        open={!!selectedTask}
        onClose={() => {
          setSelectedTask(null);
          setReviewAction(null);
        }}
        title={reviewAction === 'APPROVE' ? 'Approve Task Completion' : 'Request Task Changes'}
        description={`Task ${selectedTask?.code}: ${selectedTask?.title}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedTask(null);
                setReviewAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'APPROVE' ? 'success' : 'danger'}
              loading={submitting}
              onClick={handleReviewSubmit}
            >
              {reviewAction === 'APPROVE' ? 'Confirm Approval' : 'Send Changes Request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label={reviewAction === 'APPROVE' ? 'Approval Comments (Optional)' : 'Reason / Specific Feedback Required'}
            required={reviewAction === 'REJECT'}
          >
            <Textarea
              rows={4}
              placeholder={
                reviewAction === 'APPROVE'
                  ? 'Add praise or completion notes...'
                  : 'Specify what needs to be fixed, missing requirements, or guidelines...'
              }
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
