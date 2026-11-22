import { useEffect, useMemo, useState } from 'react';
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
  Input,
  Modal,
  Select,
  Spinner,
  StatTile,
  Textarea,
} from '../../components/ui';
import { api } from '../../lib/api';
import type { OrgNode, User } from '../../lib/types';

const ROLE_TONES: Record<string, string> = {
  CEO: 'bg-violet-100 text-violet-800 ring-violet-300',
  SUPER_ADMIN: 'bg-slate-900 text-white ring-slate-800',
  HR_ADMIN: 'bg-sky-100 text-sky-800 ring-sky-300',
  MANAGER: 'bg-primary-100 text-primary-800 ring-primary-300',
  TEAM_LEAD: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  FINANCE: 'bg-amber-100 text-amber-800 ring-amber-300',
  EMPLOYEE: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function OrgHierarchy() {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [allEmployees, setAllEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tree controls
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Move Modal State
  const [moveNode, setMoveNode] = useState<OrgNode | null>(null);
  const [targetManagerId, setTargetManagerId] = useState<string>('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Assign Task Modal State
  const [taskNode, setTaskNode] = useState<OrgNode | null>(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    dueDate: '',
    estimatedHours: '8',
  });

  // Action status state
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadTree = async () => {
    try {
      setLoading(true);
      setError(null);
      const [resTree, resUsers] = await Promise.all([
        api.get<{ data: OrgNode[] }>('/employees/org-chart'),
        api.get<{ data: User[] }>('/employees?pageSize=200'),
      ]);
      setNodes(resTree.data || []);
      setAllEmployees(resUsers.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizational hierarchy chart');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  // Compute Tree Stats
  const stats = useMemo(() => {
    let people = 0;
    let managers = 0;
    let maxDepth = 0;

    const walk = (node: OrgNode, depth: number) => {
      people += 1;
      if (node.children.length) managers += 1;
      maxDepth = Math.max(maxDepth, depth);
      node.children.forEach((child) => walk(child, depth + 1));
    };

    nodes.forEach((root) => walk(root, 1));
    return { people, managers, maxDepth };
  }, [nodes]);

  // Expand / Collapse toggles
  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setCollapsed(new Set());
  };

  const collapseAll = () => {
    const allParentIds = new Set<string>();
    const collectParents = (node: OrgNode) => {
      if (node.children.length > 0) {
        allParentIds.add(node.id);
        node.children.forEach(collectParents);
      }
    };
    nodes.forEach(collectParents);
    setCollapsed(allParentIds);
  };

  // Move Manager Handler
  const handleMoveSubmit = async () => {
    if (!moveNode) return;
    try {
      setMoving(true);
      setMoveError(null);
      await api.post(`/employees/${moveNode.id}/manager`, {
        managerId: targetManagerId || null,
      });
      setMoveNode(null);
      loadTree();
    } catch (err: any) {
      setMoveError(err.message || 'Failed to move employee');
    } finally {
      setMoving(false);
    }
  };

  // Assign Task Handler
  const handleTaskSubmit = async () => {
    if (!taskNode) return;
    if (!taskForm.title.trim()) {
      setTaskError('Task title is required');
      return;
    }
    try {
      setTaskSubmitting(true);
      setTaskError(null);
      await api.post('/tasks', {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        priority: taskForm.priority,
        assigneeId: taskNode.id,
        dueDate: taskForm.dueDate || undefined,
        estimatedHours: taskForm.estimatedHours ? Number(taskForm.estimatedHours) : undefined,
      });
      setTaskNode(null);
      setTaskForm({
        title: '',
        description: '',
        priority: 'MEDIUM',
        dueDate: '',
        estimatedHours: '8',
      });
      alert(`Task successfully assigned to ${taskNode.name}!`);
    } catch (err: any) {
      setTaskError(err.message || 'Failed to create and assign task');
    } finally {
      setTaskSubmitting(false);
    }
  };

  // Toggle Active / Deactivated
  const handleToggleStatus = async (node: OrgNode) => {
    const newStatus = node.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    const confirmMsg =
      newStatus === 'DEACTIVATED'
        ? `Are you sure you want to deactivate ${node.name}? They will lose access to the portal immediately.`
        : `Reactivate account for ${node.name}?`;
    if (!confirm(confirmMsg)) return;

    try {
      setActionBusy(node.id);
      await api.post(`/employees/${node.id}/status`, { status: newStatus });
      loadTree();
    } catch (err: any) {
      alert(err.message || 'Failed to update employee status');
    } finally {
      setActionBusy(null);
    }
  };

  // Search filter helper: returns true if node or any descendant matches search
  const matchesSearch = (node: OrgNode, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    const selfMatch =
      node.name.toLowerCase().includes(q) ||
      (node.employeeCode && node.employeeCode.toLowerCase().includes(q)) ||
      (node.designation && node.designation.toLowerCase().includes(q)) ||
      (node.department && node.department.toLowerCase().includes(q)) ||
      (node.roleName && node.roleName.toLowerCase().includes(q));
    if (selfMatch) return true;
    return node.children.some((child) => matchesSearch(child, query));
  };

  // Identify true executive roots vs unassigned employees
  const executiveRoots = nodes.filter(
    (n) => n.roleKey === 'SUPER_ADMIN' || n.roleKey === 'CEO' || n.directReports > 0,
  );
  const unassignedRoots = nodes.filter(
    (n) => n.roleKey !== 'SUPER_ADMIN' && n.roleKey !== 'CEO' && n.directReports === 0,
  );

  // Render individual tree node with branch lines and action bar
  const renderTreeNode = (node: OrgNode, depth: number = 0) => {
    if (search.trim() && !matchesSearch(node, search.trim())) {
      return null;
    }

    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isSuperAdmin = node.roleKey === 'SUPER_ADMIN' || node.roleKey === 'CEO';
    const isDeactivated = node.status === 'DEACTIVATED';

    return (
      <div key={node.id} className="relative">
        {/* Node Card */}
        <div
          className={`group relative my-2 rounded-xl border transition duration-150 ${
            isDeactivated
              ? 'border-slate-200 bg-slate-50 opacity-70'
              : isSuperAdmin
              ? 'border-primary-300 bg-gradient-to-r from-primary-50/50 via-white to-white shadow-sm ring-1 ring-primary-200/50'
              : hasChildren
              ? 'border-slate-200 bg-white shadow-xs hover:border-primary-300 hover:shadow-sm'
              : 'border-slate-200/80 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
            {/* Left: Avatar, Name, Badges */}
            <div className="flex items-center gap-3">
              {/* Expand / Collapse Button */}
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleCollapse(node.id)}
                  title={isCollapsed ? 'Expand branch' : 'Collapse branch'}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  {isCollapsed ? '+' : '−'}
                </button>
              ) : (
                <div className="w-7 text-center text-xs text-slate-300 font-mono">•</div>
              )}

              <Avatar name={node.name} size="md" />

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/admin/employees/${node.id}`}
                    className="text-sm font-bold text-slate-900 hover:text-primary-600 transition"
                  >
                    {node.name}
                  </Link>

                  <Badge tone={ROLE_TONES[node.roleKey] ?? 'bg-slate-100 text-slate-700'}>
                    {node.roleName || node.roleKey}
                  </Badge>

                  {isSuperAdmin && (
                    <Badge tone="bg-amber-100 text-amber-900 ring-amber-200">
                      ★ Executive / CEO
                    </Badge>
                  )}

                  {isDeactivated && (
                    <Badge tone="bg-rose-100 text-rose-800 ring-rose-200">Deactivated</Badge>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono font-medium text-slate-700">{node.employeeCode}</span>
                  {' · '}
                  <span>{node.designation || 'Staff Member'}</span>
                  {node.department && <span> · {node.department}</span>}
                </p>
              </div>
            </div>

            {/* Right: Reports count & Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {node.directReports > 0 && (
                <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">
                  {node.directReports} Direct · {node.totalReports} Total Reports
                </Badge>
              )}

              {/* Action: View Profile */}
              <Link
                to={`/admin/employees/${node.id}`}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
                title="View full employee profile"
              >
                Profile
              </Link>

              {/* Action: Assign Task */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTaskNode(node);
                  setTaskError(null);
                }}
                title="Create and assign task to this employee"
              >
                + Assign Task
              </Button>

              {/* Action: Move / Change Manager */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMoveNode(node);
                  setTargetManagerId('');
                  setMoveError(null);
                }}
                title="Change reporting manager"
              >
                Move
              </Button>

              {/* Action: Edit */}
              <Link
                to={`/admin/employees/${node.id}`}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
              >
                Edit
              </Link>

              {/* Action: Deactivate / Activate */}
              {!isSuperAdmin && (
                <Button
                  variant={isDeactivated ? 'success' : 'danger'}
                  size="sm"
                  loading={actionBusy === node.id}
                  onClick={() => handleToggleStatus(node)}
                  title={isDeactivated ? 'Reactivate employee account' : 'Deactivate employee account'}
                >
                  {isDeactivated ? 'Activate' : 'Deactivate'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Children Sub-branches with connecting tree line */}
        {hasChildren && !isCollapsed && (
          <div className="relative ml-6 pl-4 border-l-2 border-primary-100 sm:ml-9 sm:pl-6 space-y-1">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizational Reporting Hierarchy"
        description="Visual reporting tree showing Founder & Executive Leaders → Managers → Team Leads → Direct Reports."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/employees"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Add Employee
            </Link>
            <Button variant="secondary" onClick={loadTree}>
              ↻ Refresh
            </Button>
          </div>
        }
      />

      {/* Stats Summary Bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total Workforce" value={stats.people} hint="In reporting tree" />
        <StatTile label="People Managers" value={stats.managers} hint="Leading teams" />
        <StatTile label="Hierarchy Depth" value={stats.maxDepth} hint="Levels deep" />
      </div>

      {/* Search & Tree Controls Toolbar */}
      <Card bodyClassName="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              placeholder="Search by name, role, code, or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
      </Card>

      {/* Unassigned Employees Notice & Section */}
      {unassignedRoots.length > 0 && (
        <Card
          title={
            <div className="flex items-center gap-2 text-amber-900">
              <span>⚠ Unassigned Employees ({unassignedRoots.length})</span>
            </div>
          }
          subtitle="These employees currently have no reporting manager assigned. Use 'Move / Assign' to link them under their manager or CEO."
          className="border-amber-200 bg-amber-50/40"
          bodyClassName="p-4 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unassignedRoots.map((emp) => (
              <div
                key={emp.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={emp.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{emp.name}</p>
                    <p className="text-2xs text-slate-500 truncate">
                      {emp.employeeCode} · {emp.roleName || emp.roleKey}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMoveNode(emp);
                    setTargetManagerId('');
                    setMoveError(null);
                  }}
                >
                  Assign Manager
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Visual Hierarchy Tree */}
      <Card
        title="Organizational Reporting Tree"
        subtitle="Executive Leaders & reporting structures"
        bodyClassName="p-4 sm:p-6"
      >
        {loading ? (
          <Spinner label="Rendering organizational reporting tree..." />
        ) : error ? (
          <ErrorNote message={error} />
        ) : nodes.length === 0 ? (
          <EmptyState
            title="No reporting records available"
            description="Add employees and assign their reporting managers to build the organization hierarchy."
          />
        ) : (
          <div className="space-y-4">
            {/* Render Executive and Root Branches */}
            {(executiveRoots.length > 0 ? executiveRoots : nodes).map((root) =>
              renderTreeNode(root, 0),
            )}
          </div>
        )}
      </Card>

      {/* Modal 1: Move / Change Reporting Manager */}
      <Modal
        open={!!moveNode}
        onClose={() => setMoveNode(null)}
        title="Change Reporting Manager"
        description={`Reassign ${moveNode?.name} (${moveNode?.employeeCode}) to a new manager in the hierarchy.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveNode(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={moving} onClick={handleMoveSubmit}>
              Confirm Move
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {moveError && <ErrorNote message={moveError} />}

          <Field label="Select New Reporting Manager" required>
            <Select
              value={targetManagerId}
              onChange={(e) => setTargetManagerId(e.target.value)}
            >
              <option value="">-- No Manager (Top-Level Executive / Root) --</option>
              {allEmployees
                .filter((e) => e.id !== moveNode?.id && e.status === 'ACTIVE')
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode}) — {emp.role?.name || 'Staff'}
                  </option>
                ))}
            </Select>
          </Field>

          <p className="text-xs text-slate-500">
            Note: The system automatically re-validates the reporting chain and updates the employee’s position in the org chart without cycles.
          </p>
        </div>
      </Modal>

      {/* Modal 2: Assign Task Modal */}
      <Modal
        open={!!taskNode}
        onClose={() => setTaskNode(null)}
        title={`Assign Task to ${taskNode?.name}`}
        description={`Assign a direct task to ${taskNode?.name} (${taskNode?.employeeCode}).`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTaskNode(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={taskSubmitting} onClick={handleTaskSubmit}>
              Create & Assign Task
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {taskError && <ErrorNote message={taskError} />}

          <Field label="Task Title" required>
            <Input
              placeholder="e.g. Complete quarterly audit report"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            />
          </Field>

          <Field label="Description / Instructions">
            <Textarea
              rows={3}
              placeholder="Detailed instructions or context for this assignment..."
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Priority">
              <Select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>

            <Field label="Due Date">
              <Input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
              />
            </Field>

            <Field label="Est. Hours">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={taskForm.estimatedHours}
                onChange={(e) => setTaskForm({ ...taskForm, estimatedHours: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
