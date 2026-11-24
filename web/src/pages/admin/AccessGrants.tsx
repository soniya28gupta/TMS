import { useEffect, useState } from 'react';
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
  Table,
} from '../../components/ui';
import { api, getCachedData } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { User, UserAccessGrant } from '../../lib/types';

export default function AccessGrants() {
  const initialGrants = getCachedData<UserAccessGrant[]>('/grants');
  const [grants, setGrants] = useState<UserAccessGrant[]>(initialGrants ?? []);
  const [loading, setLoading] = useState(!initialGrants);
  const [error, setError] = useState<string | null>(null);

  // Grant Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [granteeId, setGranteeId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGrants = async (showSpinner = !grants.length) => {
    try {
      if (showSpinner) setLoading(true);
      const res = await api.get<UserAccessGrant[]>('/grants');
      setGrants(res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load access grants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGrants(!initialGrants);
  }, []);

  useEffect(() => {
    if (!createOpen || employees.length > 0) return;
    async function loadEmployees() {
      try {
        const res = await api.get<{ data: User[] }>('/employees?pageSize=100');
        setEmployees(res.data || []);
        if (res.data.length >= 2) {
          setGranteeId(res.data[0].id);
          setTargetUserId(res.data[1].id);
        }
      } catch {
        // ignore
      }
    }
    if (createOpen) loadEmployees();
  }, [createOpen]);

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (granteeId === targetUserId) {
      alert('Grantee user and Target employee must be different!');
      return;
    }
    try {
      setSubmitting(true);
      await api.post('/grants', {
        granteeId,
        targetUserId,
        reason,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setCreateOpen(false);
      setReason('');
      setExpiresAt('');
      loadGrants();
    } catch (err: any) {
      alert(err.message || 'Failed to create access grant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeGrant = async (id: string) => {
    if (!confirm('Revoke this delegated access grant?')) return;
    try {
      await api.delete(`/grants/${id}`);
      loadGrants();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke grant');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delegated Access & Viewing Grants"
        description="Admin & Founder control center to grant specific users cross-department access to view a target employee's dashboard and tasks."
        actions={<Button onClick={() => setCreateOpen(true)}>+ Issue Access Grant</Button>}
      />

      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading active access grants..." />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : grants.length === 0 ? (
          <EmptyState
            title="No active access grants"
            description="No custom dashboard/task viewing grants issued yet."
            action={<Button size="sm" onClick={() => setCreateOpen(true)}>Issue First Grant</Button>}
          />
        ) : (
          <Table
            head={
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Granted To (Viewer)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Target Employee (Viewed)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Granted By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Reason / Scope</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Expiration</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Action</th>
              </tr>
            }
          >
            {grants.map((g) => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${g.grantee?.firstName || ''} ${g.grantee?.lastName || ''}`} />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {g.grantee?.firstName} {g.grantee?.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{g.grantee?.employeeCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${g.targetUser?.firstName || ''} ${g.targetUser?.lastName || ''}`} />
                    <div>
                      <p className="font-semibold text-brand-700">
                        {g.targetUser?.firstName} {g.targetUser?.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{g.targetUser?.designation || g.targetUser?.employeeCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700 font-medium">
                  {g.grantor ? `${g.grantor.firstName} ${g.grantor.lastName}` : 'Admin'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{g.reason || 'Admin delegated view'}</td>
                <td className="px-4 py-3 text-xs font-medium">
                  {g.expiresAt ? (
                    <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">
                      Expires {formatDate(g.expiresAt)}
                    </Badge>
                  ) : (
                    <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">Permanent</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs">
                  <button
                    onClick={() => handleRevokeGrant(g.id)}
                    className="font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Revoke Grant
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Grant Access Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Issue Delegated Access Grant"
        description="Select a user and grant them permission to view a target employee's dashboard, SOD/EOD, and tasks."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleCreateGrant}>
              Issue Access Grant
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateGrant} className="space-y-4">
          <Field label="Grant View Permission To (Viewer User)" required>
            <Select value={granteeId} onChange={(e) => setGranteeId(e.target.value)}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeCode}) — {e.role?.name || 'Staff'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Target Employee To View (Whose Dashboard/Tasks will be accessible)" required>
            <Select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeCode}) — {e.department?.name || 'Staff'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason / Access Purpose">
            <Input
              placeholder="e.g. Cross-functional QA lead oversight"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          <Field label="Expiration Date (Leave blank for permanent access)">
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
