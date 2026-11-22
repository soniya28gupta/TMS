import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/Layout';
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Spinner, Table } from '../../components/ui';
import { api } from '../../lib/api';
import type { Role } from '../../lib/types';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'departments' | 'teams' | 'roles'>('departments');
  const [departments, setDepartments] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [createDeptOpen, setCreateDeptOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', departmentId: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [dRes, tRes, rRes] = await Promise.all([
        api.get<{ data: any[] }>('/org/departments'),
        api.get<{ data: any[] }>('/org/teams'),
        api.get<{ data: Role[] }>('/org/roles'),
      ]);
      setDepartments(dRes.data || []);
      setTeams(tRes.data || []);
      setRoles(rRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load organization settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.post('/org/departments', deptForm);
      setCreateDeptOpen(false);
      setDeptForm({ name: '', code: '', description: '' });
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to create department');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.post('/org/teams', teamForm);
      setCreateTeamOpen(false);
      setTeamForm({ name: '', departmentId: '', description: '' });
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to create team');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Settings & Security"
        description="Configure departments, teams, role-based access control (RBAC), and global system workflows."
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('departments')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'departments' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          }`}
        >
          Departments ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'teams' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          }`}
        >
          Teams ({teams.length})
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'roles' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          }`}
        >
          Roles & RBAC Matrix ({roles.length})
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading system settings..." />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <>
          {/* Departments */}
          {activeTab === 'departments' && (
            <Card
              title="Departments"
              subtitle="Manage business units and department leaders"
              actions={<Button size="sm" onClick={() => setCreateDeptOpen(true)}>+ Add Department</Button>}
            >
              <Table
                head={
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Department Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Department Head</th>
                  </tr>
                }
              >
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-bold text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-brand-600">{d.code}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{d.description || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">
                      {d.head ? `${d.head.firstName} ${d.head.lastName}` : 'Unassigned'}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {/* Teams */}
          {activeTab === 'teams' && (
            <Card
              title="Teams"
              subtitle="Operational sub-teams grouped under departments"
              actions={<Button size="sm" onClick={() => setCreateTeamOpen(true)}>+ Add Team</Button>}
            >
              <Table
                head={
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Team Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Team Leader</th>
                  </tr>
                }
              >
                {teams.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-bold text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{t.department?.name || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">
                      {t.leader ? `${t.leader.firstName} ${t.leader.lastName}` : 'Unassigned'}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {/* Roles & RBAC Matrix */}
          {activeTab === 'roles' && (
            <Card title="System Roles & Access Levels" subtitle="Portal access privileges and system ranks">
              <Table
                head={
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Role Key</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Role Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Portal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">System Rank</th>
                  </tr>
                }
              >
                {roles.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono font-bold text-slate-800">{r.key}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 text-xs">
                      <Badge tone={r.portal === 'ADMIN' ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}>
                        {r.portal} PORTAL
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{r.id}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Create Department Modal */}
      <Modal
        open={createDeptOpen}
        onClose={() => setCreateDeptOpen(false)}
        title="Add Department"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateDeptOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleCreateDepartment}>
              Save Department
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateDepartment} className="space-y-4">
          <Field label="Department Name" required>
            <Input required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} />
          </Field>
          <Field label="Code (e.g. ENG, HR, FIN)" required>
            <Input required value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} />
          </Field>
        </form>
      </Modal>

      {/* Create Team Modal */}
      <Modal
        open={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        title="Add Team"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateTeamOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleCreateTeam}>
              Save Team
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateTeam} className="space-y-4">
          <Field label="Team Name" required>
            <Input required value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} />
          </Field>
          <Field label="Department" required>
            <Select required value={teamForm.departmentId} onChange={(e) => setTeamForm({ ...teamForm, departmentId: e.target.value })}>
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
