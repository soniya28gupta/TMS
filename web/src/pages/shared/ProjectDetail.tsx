import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  Spinner,
  Table,
  Textarea,
} from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import {
  formatBytes,
  formatDate,
  formatDateTime,
  relativeTime,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_STYLES,
} from '../../lib/format';
import { useAuth } from '../../lib/auth';
import type {
  Project,
  ProjectAttachment,
  ProjectProgressUpdate,
  ProjectSubmission,
  User,
} from '../../lib/types';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'updates' | 'history' | 'files' | 'submission'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Member Modal
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [submittingMember, setSubmittingMember] = useState(false);

  // Manual Progress Modal
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [manualProgress, setManualProgress] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);

  // Progress Update Modal
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    updateType: 'DAILY' as 'DAILY' | 'WEEKLY',
    newProgress: 0,
    completedWork: '',
    ongoingWork: '',
    blockers: '',
    nextSteps: '',
    additionalNotes: '',
  });
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const updateFileInputRef = useRef<HTMLInputElement>(null);

  // Files Tab Upload
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const generalFileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // File Preview Modal
  const [previewAttachment, setPreviewAttachment] = useState<ProjectAttachment | null>(null);

  // Final Submission Modal & Management Review
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [submittingProject, setSubmittingProject] = useState(false);
  const [submissionForm, setSubmissionForm] = useState({
    finalSummary: '',
    completedDeliverables: '',
    finalProgress: 100,
    outstandingIssues: '',
    deliveryDetails: '',
    submissionComments: '',
  });
  const [submissionFiles, setSubmissionFiles] = useState<File[]>([]);
  const submissionFileInputRef = useRef<HTMLInputElement>(null);

  // Management Review State
  const [reviewComments, setReviewComments] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const loadProject = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await api.get<Project>(`/projects/${id}`);
      setProject(res);
      setManualProgress(res.progress ?? 0);
      setUpdateForm((prev) => ({ ...prev, newProgress: res.progress ?? 0 }));
    } catch (err: any) {
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const canManage =
    can('*') ||
    project?.manager?.id === user?.id ||
    ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user?.role.key || '');

  const isProjectMember =
    canManage ||
    project?.members?.some((m) => m.userId === user?.id) ||
    project?.createdById === user?.id;

  useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await api.get<{ data: User[] }>('/employees?pageSize=100');
        setEmployees(res.data || []);
        if (res.data.length > 0) setSelectedUserId(res.data[0].id);
      } catch {
        // ignore
      }
    }
    if (canManage && addMemberOpen) loadEmployees();
  }, [canManage, addMemberOpen]);

  // Handle Add Member
  const handleAddMember = async () => {
    if (!id || !selectedUserId) return;
    try {
      setSubmittingMember(true);
      await api.post(`/projects/${id}/members`, { userId: selectedUserId, role: selectedRole });
      setAddMemberOpen(false);
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to add project member');
    } finally {
      setSubmittingMember(false);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (userId: string) => {
    if (!id || !confirm('Remove this member from the project?')) return;
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  // Handle Manual Progress Save
  const handleSaveProgress = async () => {
    if (!id) return;
    try {
      setSavingProgress(true);
      await api.patch(`/projects/${id}`, { progress: manualProgress });
      setProgressModalOpen(false);
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to update progress');
    } finally {
      setSavingProgress(false);
    }
  };

  // Upload helper for files
  const uploadFilesToServer = async (files: File[], extra?: Record<string, string>): Promise<string[]> => {
    if (!id || files.length === 0) return [];
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }
    if (extra) {
      for (const [key, val] of Object.entries(extra)) {
        formData.append(key, val);
      }
    }
    const res = await api.upload<{ data: ProjectAttachment[] }>(`/projects/${id}/attachments`, formData);
    return res.data.map((a) => a.id);
  };

  // Handle Progress Update Submit
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setSubmittingUpdate(true);
      let attachmentIds: string[] = [];
      if (updateFiles.length > 0) {
        attachmentIds = await uploadFilesToServer(updateFiles);
      }
      await api.post(`/projects/${id}/progress-updates`, {
        ...updateForm,
        attachmentIds,
      });
      setUpdateModalOpen(false);
      setUpdateFiles([]);
      setUpdateForm({
        updateType: 'DAILY',
        newProgress: updateForm.newProgress,
        completedWork: '',
        ongoingWork: '',
        blockers: '',
        nextSteps: '',
        additionalNotes: '',
      });
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to submit progress update');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  // Handle Direct File Upload (Files Tab)
  const handleDirectFileUpload = async (files: FileList | null) => {
    if (!id || !files || files.length === 0) return;
    try {
      setUploadingFiles(true);
      await uploadFilesToServer(Array.from(files));
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to upload files');
    } finally {
      setUploadingFiles(false);
      if (generalFileInputRef.current) generalFileInputRef.current.value = '';
    }
  };

  // Handle File Delete
  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!id || !confirm('Are you sure you want to delete this file?')) return;
    try {
      await api.delete(`/projects/${id}/attachments/${attachmentId}`);
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
    }
  };

  // Handle File Download
  const handleDownloadFile = async (att: ProjectAttachment) => {
    if (!id) return;
    try {
      await downloadFile(`/projects/${id}/attachments/${att.id}/download`, att.originalName);
    } catch (err: any) {
      alert(err.message || 'Failed to download file');
    }
  };

  // Handle Final Project Submission
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setSubmittingProject(true);
      let attachmentIds: string[] = [];
      if (submissionFiles.length > 0) {
        attachmentIds = await uploadFilesToServer(submissionFiles);
      }
      await api.post(`/projects/${id}/submit`, {
        ...submissionForm,
        attachmentIds,
      });
      setSubmissionModalOpen(false);
      setSubmissionFiles([]);
      loadProject();
      setActiveTab('submission');
    } catch (err: any) {
      alert(err.message || 'Failed to submit project for review');
    } finally {
      setSubmittingProject(false);
    }
  };

  // Handle Management Review
  const handleReviewAction = async (action: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') => {
    if (!id || !latestSubmission) return;
    if (!reviewComments.trim()) {
      alert('Please enter your review feedback and comments before submitting');
      return;
    }
    const confirmMsg =
      action === 'APPROVED'
        ? 'Approve this project and mark it Completed?'
        : action === 'CHANGES_REQUESTED'
        ? 'Request changes and return project to In Progress?'
        : 'Reject this project submission?';
    if (!confirm(confirmMsg)) return;

    try {
      setReviewing(true);
      await api.post(`/projects/${id}/submissions/${latestSubmission.id}/review`, {
        action,
        managementComments: reviewComments,
      });
      setReviewComments('');
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to complete review');
    } finally {
      setReviewing(false);
    }
  };

  if (loading && !project) return <Spinner label="Loading project space..." />;
  if (error) return <ErrorNote message={error} />;
  if (!project) return null;

  const totalTasks = project.tasks?.length || 0;
  const completedTasks = project.tasks?.filter((t) => t.status === 'COMPLETED').length || 0;
  const currentProgress = project.progress ?? 0;
  const latestSubmission = project.submissions?.[0];
  const pendingSubmission = project.submissions?.find((s) => s.status === 'PENDING');

  const getStatusBadge = (st: string) => {
    const label = PROJECT_STATUS_LABELS[st] || st;
    const tone = PROJECT_STATUS_STYLES[st] || 'bg-slate-100 text-slate-700 ring-slate-200';
    return <Badge tone={tone}>{label}</Badge>;
  };

  const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎥';
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('excel') || mime.includes('sheet') || mime.includes('csv')) return '📊';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '📽️';
    if (mime.includes('zip')) return '📦';
    return '📎';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${project.code}: ${project.name}`}
        description={`Lead: ${project.manager?.firstName || ''} ${project.manager?.lastName || ''} · Department: ${
          project.department?.name || 'General'
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isProjectMember && project.status !== 'COMPLETED' && (
              <Button variant="secondary" onClick={() => setProgressModalOpen(true)}>
                ⚙️ Adjust Progress
              </Button>
            )}
            {isProjectMember && project.status !== 'COMPLETED' && (
              <Button onClick={() => setUpdateModalOpen(true)}>+ Add Progress Update</Button>
            )}
            {isProjectMember && project.status !== 'COMPLETED' && project.status !== 'UNDER_REVIEW' && (
              <Button variant="success" onClick={() => setSubmissionModalOpen(true)}>
                🚀 Submit for Review
              </Button>
            )}
            {canManage && (
              <Button variant="secondary" onClick={() => setAddMemberOpen(true)}>
                + Team Member
              </Button>
            )}
          </div>
        }
      />

      {/* Progress & Status Banner */}
      <Card bodyClassName="p-5">
        <div className="grid gap-6 md:grid-cols-12 items-center">
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Manual Project Progress
              </span>
              <span className="text-lg font-extrabold text-brand-600">{currentProgress}%</span>
            </div>
            <ProgressBar value={currentProgress} />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>0% (Not Started)</span>
              <span>100% (Ready for Review)</span>
            </div>
          </div>

          <div className="md:col-span-4 flex items-center gap-4 border-l border-slate-200 pl-4">
            <div>
              <p className="text-xs text-slate-500">Current Status</p>
              <div className="mt-1">{getStatusBadge(project.status)}</div>
              {project.status === 'UNDER_REVIEW' && (
                <p className="text-[11px] text-purple-700 font-semibold mt-1 animate-pulse">
                  Pending Management Approval
                </p>
              )}
            </div>
            <div className="border-l border-slate-100 pl-4">
              <p className="text-xs text-slate-500">Tasks Completed</p>
              <p className="mt-1 text-sm font-bold text-slate-800">
                {completedTasks} / {totalTasks}
              </p>
              <p className="text-[11px] text-slate-400">
                {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}% task completion
              </p>
            </div>
          </div>

          <div className="md:col-span-3 text-xs text-slate-600 border-l border-slate-200 pl-4 space-y-1">
            <p>
              <strong className="text-slate-700">Start Date:</strong>{' '}
              {project.startDate ? formatDate(project.startDate) : 'Not specified'}
            </p>
            <p>
              <strong className="text-slate-700">Target Due:</strong>{' '}
              {project.dueDate ? formatDate(project.dueDate) : 'No due date'}
            </p>
            {project.completedAt && (
              <p className="text-emerald-700 font-medium">
                <strong>Completed On:</strong> {formatDate(project.completedAt)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Navigation Tabs (5 Tabs) */}
      <div className="flex border-b border-slate-200 space-x-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'overview'
              ? 'border-brand-600 text-brand-600 bg-brand-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Project Overview
        </button>

        <button
          onClick={() => setActiveTab('updates')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'updates'
              ? 'border-brand-600 text-brand-600 bg-brand-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Progress Updates ({project.progressUpdates?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'history'
              ? 'border-brand-600 text-brand-600 bg-brand-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Progress History Timeline
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'files'
              ? 'border-brand-600 text-brand-600 bg-brand-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Files & Attachments ({project.attachments?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('submission')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition flex items-center gap-1.5 ${
            activeTab === 'submission'
              ? 'border-brand-600 text-brand-600 bg-brand-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Final Submission & Approvals
          {pendingSubmission && (
            <span className="flex h-2 w-2 rounded-full bg-purple-500 animate-ping" />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* Description & Scope */}
              <Card title="Project Specification & Scope">
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {project.description || 'No detailed scope description entered for this project.'}
                </p>
              </Card>

              {/* Latest Progress Update Summary Card */}
              {project.progressUpdates && project.progressUpdates.length > 0 ? (
                <Card
                  title="Latest Progress Update"
                  actions={
                    <Button size="sm" variant="ghost" onClick={() => setActiveTab('updates')}>
                      View All Updates →
                    </Button>
                  }
                >
                  {(() => {
                    const latest = project.progressUpdates[0];
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <Badge tone={latest.updateType === 'DAILY' ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-purple-50 text-purple-700 ring-purple-200'}>
                              {latest.updateType} UPDATE
                            </Badge>
                            <span className="text-xs text-slate-500 font-medium">
                              By {latest.employee?.firstName} {latest.employee?.lastName} · {formatDateTime(latest.createdAt)}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-brand-600">
                            {latest.previousProgress}% → {latest.newProgress}%
                          </span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 text-xs">
                          <div className="rounded-lg bg-emerald-50/50 p-2.5 border border-emerald-100">
                            <p className="font-semibold text-emerald-800">Completed Work</p>
                            <p className="mt-1 text-slate-700 line-clamp-3">{latest.completedWork}</p>
                          </div>
                          <div className="rounded-lg bg-indigo-50/50 p-2.5 border border-indigo-100">
                            <p className="font-semibold text-indigo-800">Ongoing Work</p>
                            <p className="mt-1 text-slate-700 line-clamp-3">{latest.ongoingWork}</p>
                          </div>
                        </div>

                        {latest.blockers && (
                          <div className="rounded-lg bg-rose-50 p-2.5 border border-rose-200 text-xs">
                            <p className="font-semibold text-rose-800">Blockers / Issues</p>
                            <p className="mt-0.5 text-rose-900">{latest.blockers}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </Card>
              ) : (
                <Card bodyClassName="p-4 text-center text-xs text-slate-500">
                  No progress updates submitted yet.{' '}
                  {isProjectMember && (
                    <button
                      onClick={() => setUpdateModalOpen(true)}
                      className="text-brand-600 font-semibold hover:underline ml-1"
                    >
                      Post first update
                    </button>
                  )}
                </Card>
              )}

              {/* Linked Tasks */}
              <Card title={`Linked Tasks (${totalTasks})`}>
                {!project.tasks || project.tasks.length === 0 ? (
                  <EmptyState
                    title="No tasks linked"
                    description="No tasks have been assigned under this project yet."
                  />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {project.tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between py-3">
                        <div>
                          <span className="text-xs font-mono font-bold text-brand-600">{task.code}</span>
                          <Link
                            to={`/tasks/${task.id}`}
                            className="block text-sm font-semibold text-slate-900 hover:text-brand-600"
                          >
                            {task.title}
                          </Link>
                          <p className="text-xs text-slate-500">
                            Assignee:{' '}
                            {task.assignee
                              ? `${task.assignee.firstName} ${task.assignee.lastName}`
                              : 'Unassigned'}
                          </p>
                        </div>
                        <Badge tone="bg-slate-100 text-slate-800 ring-slate-200">
                          {task.displayStatus || task.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Team Members Column */}
            <div className="space-y-6">
              <Card
                title={`Assigned Team (${project.members?.length || 0})`}
                actions={
                  canManage ? (
                    <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                      + Add
                    </Button>
                  ) : undefined
                }
              >
                <div className="divide-y divide-slate-100">
                  {project.members?.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${m.user.firstName} ${m.user.lastName}`} size="sm" />
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            {m.user.firstName} {m.user.lastName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {m.user.employeeCode} · {m.role}
                          </p>
                        </div>
                      </div>
                      {canManage && m.user.id !== (project.manager?.id || project.managerId) && (
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Project Metadata Card */}
              <Card title="Project Details">
                <div className="text-xs text-slate-600 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Project Code:</span>
                    <span className="font-mono font-bold text-slate-800">{project.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Department:</span>
                    <span className="font-medium text-slate-800">
                      {project.department?.name || 'General'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Project Manager:</span>
                    <span className="font-medium text-slate-800">
                      {project.manager?.firstName} {project.manager?.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Created By:</span>
                    <span className="font-medium text-slate-800">
                      {project.createdBy?.firstName} {project.createdBy?.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Start Date:</span>
                    <span className="font-medium text-slate-800">
                      {project.startDate ? formatDate(project.startDate) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target Due Date:</span>
                    <span className="font-medium text-slate-800">
                      {project.dueDate ? formatDate(project.dueDate) : '—'}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PROGRESS UPDATES */}
      {/* ========================================================================= */}
      {activeTab === 'updates' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Daily & Weekly Progress Updates</h3>
              <p className="text-xs text-slate-500">
                Work completed, ongoing work, blockers, next steps, and progress advancements.
              </p>
            </div>
            {isProjectMember && project.status !== 'COMPLETED' && (
              <Button onClick={() => setUpdateModalOpen(true)}>+ Add Progress Update</Button>
            )}
          </div>

          {!project.progressUpdates || project.progressUpdates.length === 0 ? (
            <Card bodyClassName="p-0">
              <EmptyState
                title="No progress updates submitted"
                description="Keep your team and manager informed by submitting daily or weekly progress updates."
                action={
                  isProjectMember && project.status !== 'COMPLETED' ? (
                    <Button size="sm" onClick={() => setUpdateModalOpen(true)}>
                      Add First Update
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {project.progressUpdates.map((update) => (
                <Card key={update.id} bodyClassName="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={`${update.employee?.firstName || ''} ${update.employee?.lastName || ''}`}
                        size="md"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {update.employee?.firstName} {update.employee?.lastName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {update.employee?.role?.name || 'Team Member'} · Submitted {formatDateTime(update.createdAt)} ({relativeTime(update.createdAt)})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        tone={
                          update.updateType === 'DAILY'
                            ? 'bg-sky-50 text-sky-700 ring-sky-200'
                            : 'bg-purple-50 text-purple-700 ring-purple-200'
                        }
                      >
                        {update.updateType} UPDATE
                      </Badge>
                      <div className="rounded-lg bg-brand-50 px-3 py-1 border border-brand-100 text-xs font-bold text-brand-700">
                        {update.previousProgress}% → {update.newProgress}%
                      </div>
                    </div>
                  </div>

                  {/* Body Grid */}
                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl bg-emerald-50/60 p-3.5 border border-emerald-100/80">
                      <p className="font-bold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                        <span>✓</span> Completed Work
                      </p>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {update.completedWork}
                      </p>
                    </div>

                    <div className="rounded-xl bg-indigo-50/60 p-3.5 border border-indigo-100/80">
                      <p className="font-bold text-indigo-800 flex items-center gap-1.5 mb-1.5">
                        <span>⏳</span> Ongoing Work
                      </p>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {update.ongoingWork}
                      </p>
                    </div>
                  </div>

                  {/* Blockers & Next Steps */}
                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    {update.blockers ? (
                      <div className="rounded-xl bg-rose-50 p-3.5 border border-rose-200">
                        <p className="font-bold text-rose-800 flex items-center gap-1.5 mb-1.5">
                          <span>⚠️</span> Blockers / Issues
                        </p>
                        <p className="text-rose-900 whitespace-pre-wrap leading-relaxed">
                          {update.blockers}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-slate-500">
                        <p className="font-semibold text-slate-700 mb-1">Blockers / Issues</p>
                        <p className="italic">No blockers reported.</p>
                      </div>
                    )}

                    <div className="rounded-xl bg-purple-50/60 p-3.5 border border-purple-100/80">
                      <p className="font-bold text-purple-800 flex items-center gap-1.5 mb-1.5">
                        <span>🎯</span> Next Steps
                      </p>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {update.nextSteps}
                      </p>
                    </div>
                  </div>

                  {/* Additional Notes */}
                  {update.additionalNotes && (
                    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 border border-slate-100">
                      <strong className="text-slate-800">Additional Notes:</strong> {update.additionalNotes}
                    </div>
                  )}

                  {/* Attached Files */}
                  {update.attachments && update.attachments.length > 0 && (
                    <div className="border-t border-slate-100 pt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Attachments:</span>
                      {update.attachments.map((att) => (
                        <button
                          key={att.id}
                          onClick={() => handleDownloadFile(att)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <span>{getFileIcon(att.mimeType)}</span>
                          <span className="max-w-[150px] truncate">{att.originalName}</span>
                          <span className="text-[10px] text-slate-400">({formatBytes(att.fileSize)})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PROGRESS HISTORY TIMELINE */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Project Progress Timeline</h3>
            <p className="text-xs text-slate-500">
              Immutable chronological history of all progress updates, milestones, and review actions.
            </p>
          </div>

          <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-8 py-2">
            {/* Project Created Milestone */}
            <div className="relative">
              <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white text-[11px]">
                🏁
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-500">{formatDate(project.createdAt)}</p>
                <p className="text-sm font-bold text-slate-900">Project Space Initialized</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Created by {project.createdBy?.firstName} {project.createdBy?.lastName} with initial status{' '}
                  <span className="font-semibold">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>.
                </p>
              </div>
            </div>

            {/* Updates list in chronological order */}
            {project.progressUpdates &&
              [...project.progressUpdates]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((upd) => (
                  <div key={upd.id} className="relative">
                    <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white ring-4 ring-white text-[11px] font-bold">
                      {upd.newProgress}%
                    </span>
                    <Card bodyClassName="p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">
                          {upd.employee?.firstName} {upd.employee?.lastName} submitted {upd.updateType} update
                        </span>
                        <span className="text-slate-400">{formatDateTime(upd.createdAt)}</span>
                      </div>
                      <div className="text-xs text-slate-700 space-y-1">
                        <p>
                          <strong className="text-emerald-700">Completed:</strong> {upd.completedWork}
                        </p>
                        <p>
                          <strong className="text-indigo-700">Ongoing:</strong> {upd.ongoingWork}
                        </p>
                        {upd.blockers && (
                          <p>
                            <strong className="text-rose-700">Blockers:</strong> {upd.blockers}
                          </p>
                        )}
                        <p>
                          <strong className="text-purple-700">Next Steps:</strong> {upd.nextSteps}
                        </p>
                      </div>
                    </Card>
                  </div>
                ))}

            {/* Submissions & Reviews in Timeline */}
            {project.submissions &&
              project.submissions.map((sub) => (
                <div key={sub.id} className="relative">
                  <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white ring-4 ring-white text-[11px]">
                    ⭐
                  </span>
                  <Card bodyClassName="p-4 space-y-2 border-purple-200 bg-purple-50/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-purple-900">
                        Final Project Submission for Review ({sub.status})
                      </span>
                      <span className="text-slate-400">{formatDateTime(sub.submittedAt)}</span>
                    </div>
                    <p className="text-xs text-slate-800">
                      <strong>Submitted by:</strong> {sub.submittedBy?.firstName} {sub.submittedBy?.lastName}
                    </p>
                    <p className="text-xs text-slate-700">
                      <strong>Summary:</strong> {sub.finalSummary}
                    </p>
                    {sub.managementComments && (
                      <div className="rounded-lg bg-white p-2.5 border border-slate-200 text-xs">
                        <p className="font-bold text-slate-800">Management Decision: {sub.status}</p>
                        <p className="text-slate-600 mt-0.5">{sub.managementComments}</p>
                        {sub.reviewedBy && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            Reviewed by {sub.reviewedBy.firstName} {sub.reviewedBy.lastName} on {formatDateTime(sub.reviewedAt)}
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: FILES & ATTACHMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'files' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Project Files & Attachments</h3>
              <p className="text-xs text-slate-500">
                Documents, spreadsheets, presentations, code archives, screenshots, and demonstration videos.
              </p>
            </div>
            {isProjectMember && (
              <div>
                <input
                  type="file"
                  multiple
                  ref={generalFileInputRef}
                  className="hidden"
                  onChange={(e) => handleDirectFileUpload(e.target.files)}
                />
                <Button
                  loading={uploadingFiles}
                  onClick={() => generalFileInputRef.current?.click()}
                >
                  + Upload Files
                </Button>
              </div>
            )}
          </div>

          {/* Drag & Drop Upload Zone */}
          {isProjectMember && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleDirectFileUpload(e.dataTransfer.files);
              }}
              onClick={() => generalFileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
                dragActive
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600 text-xl font-bold mb-3">
                ☁️
              </div>
              <p className="text-sm font-semibold text-slate-800">
                Drag and drop your project files here, or{' '}
                <span className="text-brand-600 underline">browse</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Images (PNG, JPG, WEBP), Documents (PDF, DOCX), Sheets (XLSX, CSV), Presentations (PPT, PPTX), Videos (MP4, WEBM, MOV), TXT, ZIP
              </p>
            </div>
          )}

          {/* Files Table */}
          {!project.attachments || project.attachments.length === 0 ? (
            <Card bodyClassName="p-0">
              <EmptyState
                title="No files attached"
                description="No deliverables or assets have been uploaded to this project yet."
              />
            </Card>
          ) : (
            <Card bodyClassName="p-0 overflow-hidden">
              <Table
                head={
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">File Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Size</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Uploaded By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                }
              >
                {project.attachments.map((att) => {
                  const canDelete =
                    canManage || att.uploadedById === user?.id || user?.role.key === 'SUPER_ADMIN';
                  const isImage = att.mimeType.startsWith('image/');
                  const isVideo = att.mimeType.startsWith('video/');
                  const isPdf = att.mimeType.includes('pdf');

                  return (
                    <tr key={att.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{getFileIcon(att.mimeType)}</span>
                          <div>
                            <p className="text-xs font-bold text-slate-900 max-w-[260px] truncate">
                              {att.originalName}
                            </p>
                            <span className="text-[10px] font-mono text-slate-400">
                              {att.mimeType}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                        {formatBytes(att.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {att.uploadedBy?.firstName} {att.uploadedBy?.lastName}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDateTime(att.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs space-x-2">
                        {(isImage || isVideo || isPdf) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewAttachment(att)}
                          >
                            Preview
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDownloadFile(att)}
                        >
                          Download
                        </Button>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="text-xs font-medium text-rose-600 hover:text-rose-800 ml-2"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FINAL SUBMISSION & MANAGEMENT REVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'submission' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Project Review & Management Approval</h3>
              <p className="text-xs text-slate-500">
                Final project deliverable handover, quality assessment, and management sign-off.
              </p>
            </div>
            {isProjectMember && project.status !== 'COMPLETED' && project.status !== 'UNDER_REVIEW' && (
              <Button variant="success" onClick={() => setSubmissionModalOpen(true)}>
                🚀 Submit Project for Review
              </Button>
            )}
          </div>

          {/* Submission Status Banners */}
          {project.status === 'UNDER_REVIEW' && pendingSubmission && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-200 text-purple-800 text-xl font-bold">
                  ⏳
                </span>
                <div>
                  <h4 className="text-sm font-bold text-purple-900">
                    Project Under Review (Pending Management Approval)
                  </h4>
                  <p className="text-xs text-purple-700">
                    Submitted by {pendingSubmission.submittedBy?.firstName}{' '}
                    {pendingSubmission.submittedBy?.lastName} on {formatDateTime(pendingSubmission.submittedAt)}
                  </p>
                </div>
              </div>

              {/* Submitted Details */}
              <div className="rounded-xl bg-white p-4 border border-purple-100 text-xs space-y-3">
                <div>
                  <strong className="text-slate-800">Final Summary:</strong>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{pendingSubmission.finalSummary}</p>
                </div>
                <div>
                  <strong className="text-slate-800">Completed Deliverables:</strong>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{pendingSubmission.completedDeliverables}</p>
                </div>
                {pendingSubmission.outstandingIssues && (
                  <div>
                    <strong className="text-slate-800">Outstanding Issues / Known Limitations:</strong>
                    <p className="mt-1 text-rose-800 whitespace-pre-wrap">{pendingSubmission.outstandingIssues}</p>
                  </div>
                )}
                {pendingSubmission.deliveryDetails && (
                  <div>
                    <strong className="text-slate-800">Deployment / Handover Details:</strong>
                    <p className="mt-1 text-slate-700 whitespace-pre-wrap">{pendingSubmission.deliveryDetails}</p>
                  </div>
                )}
              </div>

              {/* Management Review Controls */}
              {canManage && (
                <div className="rounded-xl bg-white p-4 border border-purple-200 space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Management Approval Decision
                  </h5>
                  <p className="text-xs text-slate-500">
                    Provide feedback or requirements. Approving marks the project Completed.
                  </p>
                  <Textarea
                    rows={3}
                    placeholder="Enter review feedback, comments, or required changes..."
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      variant="success"
                      loading={reviewing}
                      onClick={() => handleReviewAction('APPROVED')}
                    >
                      ✓ Approve Project (Mark Completed)
                    </Button>
                    <Button
                      variant="secondary"
                      loading={reviewing}
                      onClick={() => handleReviewAction('CHANGES_REQUESTED')}
                    >
                      ⚠️ Request Changes
                    </Button>
                    <Button
                      variant="danger"
                      loading={reviewing}
                      onClick={() => handleReviewAction('REJECTED')}
                    >
                      ✕ Reject Submission
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {project.status === 'COMPLETED' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-200 text-emerald-800 text-2xl font-bold">
                ✓
              </span>
              <div>
                <h4 className="text-base font-bold text-emerald-900">Project Approved & Completed!</h4>
                <p className="text-xs text-emerald-700 mt-1">
                  This project has undergone management review, received final approval, and is officially marked as Completed.
                </p>
                {latestSubmission?.managementComments && (
                  <p className="text-xs font-medium text-emerald-800 mt-2 bg-emerald-100/60 p-2.5 rounded-lg border border-emerald-200">
                    <strong>Management Comments:</strong> {latestSubmission.managementComments}
                  </p>
                )}
              </div>
            </div>
          )}

          {latestSubmission && latestSubmission.status === 'CHANGES_REQUESTED' && project.status !== 'UNDER_REVIEW' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-200 text-amber-900 text-lg font-bold">
                  !
                </span>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">Changes Requested by Management</h4>
                  <p className="text-xs text-amber-700">
                    The project was reviewed and requires updates before approval.
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 border border-amber-200 text-xs text-amber-900">
                <strong>Feedback from Reviewer:</strong> {latestSubmission.managementComments}
              </div>
              {isProjectMember && (
                <Button size="sm" onClick={() => setSubmissionModalOpen(true)}>
                  Resubmit Project with Changes
                </Button>
              )}
            </div>
          )}

          {latestSubmission && latestSubmission.status === 'REJECTED' && project.status !== 'UNDER_REVIEW' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-200 text-rose-900 text-lg font-bold">
                  ✕
                </span>
                <div>
                  <h4 className="text-sm font-bold text-rose-900">Submission Rejected</h4>
                  <p className="text-xs text-rose-700">
                    The previous submission was rejected.
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 border border-rose-200 text-xs text-rose-900">
                <strong>Rejection Reason:</strong> {latestSubmission.managementComments}
              </div>
              {isProjectMember && (
                <Button size="sm" onClick={() => setSubmissionModalOpen(true)}>
                  Submit New Proposal / Deliverables
                </Button>
              )}
            </div>
          )}

          {/* Submission History / Audit Log */}
          {project.submissions && project.submissions.length > 0 && (
            <Card title="Approval & Submission Audit Trail">
              <div className="divide-y divide-slate-100">
                {project.submissions.map((sub) => (
                  <div key={sub.id} className="py-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge tone={sub.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : sub.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-purple-50 text-purple-700 ring-purple-200'}>
                          {sub.status}
                        </Badge>
                        <span className="font-semibold text-slate-800">
                          Submitted by {sub.submittedBy?.firstName} {sub.submittedBy?.lastName}
                        </span>
                      </div>
                      <span className="text-slate-400">{formatDateTime(sub.submittedAt)}</span>
                    </div>

                    <p className="text-xs text-slate-600 pl-2 border-l-2 border-slate-200">
                      {sub.finalSummary}
                    </p>

                    {sub.managementComments && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                        <strong>Management Feedback:</strong> {sub.managementComments}{' '}
                        {sub.reviewedBy && (
                          <span className="text-slate-400">
                            (by {sub.reviewedBy.firstName} {sub.reviewedBy.lastName})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!latestSubmission && (
            <Card bodyClassName="p-0">
              <EmptyState
                title="No project submission yet"
                description="Once all deliverables and tasks are finalized, submit the project for management review and final approval."
                action={
                  isProjectMember && project.status !== 'COMPLETED' ? (
                    <Button size="sm" onClick={() => setSubmissionModalOpen(true)}>
                      Submit Project Now
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADJUST MANUAL PROGRESS (SLIDER & INPUT) */}
      {/* ========================================================================= */}
      <Modal
        open={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        title="Adjust Project Progress"
        description="Update the manual project completion percentage (0 - 100%)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setProgressModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={savingProgress} onClick={handleSaveProgress}>
              Save Progress
            </Button>
          </>
        }
      >
        <div className="space-y-6 py-2">
          <div className="text-center">
            <span className="text-4xl font-extrabold text-brand-600">{manualProgress}%</span>
            <p className="text-xs text-slate-500 mt-1">Manual Completion Target</p>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={100}
              value={manualProgress}
              onChange={(e) => setManualProgress(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>0% (Not Started)</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100% (Completed / Ready for Review)</span>
            </div>
          </div>

          <Field label="Or Enter Exact Percentage (0 - 100)">
            <Input
              type="number"
              min={0}
              max={100}
              value={manualProgress}
              onChange={(e) => setManualProgress(Math.max(0, Math.min(100, Number(e.target.value))))}
            />
          </Field>

          <p className="text-[11px] text-slate-500 italic">
            Note: Reaching 100% progress tracks your work but does not automatically mark the project Completed. Projects must be formally submitted and approved by management.
          </p>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: ADD PROGRESS UPDATE */}
      {/* ========================================================================= */}
      <Modal
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        title="Add Progress Update"
        description="Log your daily or weekly progress, work details, blockers, and update completion percentage."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setUpdateModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={submittingUpdate} onClick={handleUpdateSubmit}>
              Submit Update
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdateSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Update Type" required>
              <Select
                value={updateForm.updateType}
                onChange={(e) =>
                  setUpdateForm({ ...updateForm, updateType: e.target.value as 'DAILY' | 'WEEKLY' })
                }
              >
                <option value="DAILY">Daily Progress Update</option>
                <option value="WEEKLY">Weekly Progress Update</option>
              </Select>
            </Field>

            <Field label={`New Project Progress: ${updateForm.newProgress}%`} required>
              <div className="pt-2 space-y-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={updateForm.newProgress}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, newProgress: Number(e.target.value) })
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
                <span className="text-[10px] text-slate-400">
                  Current project progress: {project.progress}%
                </span>
              </div>
            </Field>
          </div>

          <Field label="Completed Work" required hint="Key milestones, completed tasks, or features finished.">
            <Textarea
              rows={3}
              required
              placeholder="Detail what was finished or delivered during this period..."
              value={updateForm.completedWork}
              onChange={(e) => setUpdateForm({ ...updateForm, completedWork: e.target.value })}
            />
          </Field>

          <Field label="Ongoing Work" required hint="Items currently in active development or execution.">
            <Textarea
              rows={3}
              required
              placeholder="Detail what is currently being worked on..."
              value={updateForm.ongoingWork}
              onChange={(e) => setUpdateForm({ ...updateForm, ongoingWork: e.target.value })}
            />
          </Field>

          <Field label="Blockers / Issues" hint="Optional. Mention any obstacles, dependencies, or impediments.">
            <Textarea
              rows={2}
              placeholder="Any roadblocks or help required from management or peers..."
              value={updateForm.blockers}
              onChange={(e) => setUpdateForm({ ...updateForm, blockers: e.target.value })}
            />
          </Field>

          <Field label="Next Steps" required hint="Planned deliverables for the upcoming period.">
            <Textarea
              rows={2}
              required
              placeholder="What will be addressed next..."
              value={updateForm.nextSteps}
              onChange={(e) => setUpdateForm({ ...updateForm, nextSteps: e.target.value })}
            />
          </Field>

          <Field label="Additional Notes">
            <Input
              placeholder="Optional brief notes or references..."
              value={updateForm.additionalNotes}
              onChange={(e) => setUpdateForm({ ...updateForm, additionalNotes: e.target.value })}
            />
          </Field>

          <Field label="File Attachments (Optional)">
            <input
              type="file"
              multiple
              ref={updateFileInputRef}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setUpdateFiles(Array.from(e.target.files));
                }
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => updateFileInputRef.current?.click()}
              >
                📎 Attach Files ({updateFiles.length})
              </Button>
              {updateFiles.length > 0 && (
                <span className="text-xs text-slate-600">
                  {updateFiles.map((f) => f.name).join(', ')}
                </span>
              )}
            </div>
          </Field>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: FINAL PROJECT SUBMISSION */}
      {/* ========================================================================= */}
      <Modal
        open={submissionModalOpen}
        onClose={() => setSubmissionModalOpen(false)}
        title="Submit Project for Review"
        description="Formal submission of project deliverables and achievements for management approval."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setSubmissionModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="success" loading={submittingProject} onClick={handleFinalSubmit}>
              Submit Project for Review
            </Button>
          </>
        }
      >
        <form onSubmit={handleFinalSubmit} className="space-y-4">
          <Field label="Final Summary" required hint="Executive overview of the project's execution.">
            <Textarea
              rows={3}
              required
              placeholder="Summarize the project outcome, successes, and results..."
              value={submissionForm.finalSummary}
              onChange={(e) => setSubmissionForm({ ...submissionForm, finalSummary: e.target.value })}
            />
          </Field>

          <Field label="Completed Deliverables" required hint="List of items, features, or documents finalized.">
            <Textarea
              rows={3}
              required
              placeholder="e.g. 1. Backend REST APIs, 2. Frontend Dashboard, 3. Testing documentation..."
              value={submissionForm.completedDeliverables}
              onChange={(e) =>
                setSubmissionForm({ ...submissionForm, completedDeliverables: e.target.value })
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Final Progress Percentage (${submissionForm.finalProgress}%)`} required>
              <Input
                type="number"
                min={0}
                max={100}
                value={submissionForm.finalProgress}
                onChange={(e) =>
                  setSubmissionForm({
                    ...submissionForm,
                    finalProgress: Math.max(0, Math.min(100, Number(e.target.value))),
                  })
                }
              />
            </Field>

            <Field label="Delivery / Handover Details">
              <Input
                placeholder="Repository link, staging URL, deployment location..."
                value={submissionForm.deliveryDetails}
                onChange={(e) =>
                  setSubmissionForm({ ...submissionForm, deliveryDetails: e.target.value })
                }
              />
            </Field>
          </div>

          <Field label="Outstanding Issues / Known Limitations">
            <Textarea
              rows={2}
              placeholder="Any non-critical known issues, future improvements, or caveats..."
              value={submissionForm.outstandingIssues}
              onChange={(e) =>
                setSubmissionForm({ ...submissionForm, outstandingIssues: e.target.value })
              }
            />
          </Field>

          <Field label="Submission Comments for Management">
            <Textarea
              rows={2}
              placeholder="Any specific comments or guidance for the reviewing manager..."
              value={submissionForm.submissionComments}
              onChange={(e) =>
                setSubmissionForm({ ...submissionForm, submissionComments: e.target.value })
              }
            />
          </Field>

          <Field label="Attach Deliverables / Documentation (Optional)">
            <input
              type="file"
              multiple
              ref={submissionFileInputRef}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setSubmissionFiles(Array.from(e.target.files));
                }
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => submissionFileInputRef.current?.click()}
              >
                📎 Attach Final Files ({submissionFiles.length})
              </Button>
              {submissionFiles.length > 0 && (
                <span className="text-xs text-slate-600">
                  {submissionFiles.map((f) => f.name).join(', ')}
                </span>
              )}
            </div>
          </Field>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: FILE PREVIEW MODAL */}
      {/* ========================================================================= */}
      {previewAttachment && (
        <Modal
          open={Boolean(previewAttachment)}
          onClose={() => setPreviewAttachment(null)}
          title={`Preview: ${previewAttachment.originalName}`}
          wide
          footer={
            <>
              <Button variant="ghost" onClick={() => setPreviewAttachment(null)}>
                Close
              </Button>
              <Button onClick={() => handleDownloadFile(previewAttachment)}>
                Download File
              </Button>
            </>
          }
        >
          <div className="flex items-center justify-center p-4 bg-slate-900/5 rounded-xl min-h-[300px]">
            {previewAttachment.mimeType.startsWith('image/') ? (
              <img
                src={`/api/projects/${id}/attachments/${previewAttachment.id}/download`}
                alt={previewAttachment.originalName}
                className="max-h-[500px] max-w-full rounded object-contain shadow"
              />
            ) : previewAttachment.mimeType.startsWith('video/') ? (
              <video
                controls
                src={`/api/projects/${id}/attachments/${previewAttachment.id}/download`}
                className="max-h-[500px] max-w-full rounded"
              />
            ) : previewAttachment.mimeType.includes('pdf') ? (
              <iframe
                src={`/api/projects/${id}/attachments/${previewAttachment.id}/download`}
                title={previewAttachment.originalName}
                className="w-full h-[500px] rounded border"
              />
            ) : (
              <p className="text-sm text-slate-500">Preview not available for this format.</p>
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: ADD MEMBER MODAL */}
      {/* ========================================================================= */}
      <Modal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="Add Employee to Project Team"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button loading={submittingMember} onClick={handleAddMember}>
              Add to Team
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Select Employee" required>
            <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeCode}) — {e.department?.name || 'Staff'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project Role" required>
            <Select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              <option value="MEMBER">Team Member</option>
              <option value="LEAD">Project Lead</option>
              <option value="VIEWER">Viewer</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
