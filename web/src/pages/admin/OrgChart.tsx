import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  Spinner,
  StatTile,
  cx,
} from '../../components/ui';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import type { OrgNode } from '../../lib/types';

const ROLE_TONES: Record<string, string> = {
  CEO: 'bg-violet-50 text-violet-700 ring-violet-200',
  SUPER_ADMIN: 'bg-slate-800 text-white ring-slate-700',
  HR_ADMIN: 'bg-sky-50 text-sky-700 ring-sky-200',
  MANAGER: 'bg-brand-50 text-brand-700 ring-brand-200',
  TEAM_LEAD: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FINANCE: 'bg-amber-50 text-amber-700 ring-amber-200',
  EMPLOYEE: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function OrgChart() {
  const { user, scopeOf } = useAuth();
  const { data, loading, error } = useApi<{ data: OrgNode[]; scope: string }>('/employees/org-chart');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    if (!data?.data) return { people: 0, managers: 0, depth: 0 };
    let people = 0;
    let managers = 0;
    let depth = 0;

    const walk = (node: OrgNode, level: number) => {
      people += 1;
      if (node.children.length) managers += 1;
      depth = Math.max(depth, level);
      node.children.forEach((child) => walk(child, level + 1));
    };
    data.data.forEach((root) => walk(root, 1));
    return { people, managers, depth };
  }, [data]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  const scope = scopeOf('employee.read');
  const scopeLabel =
    scope === 'all'
      ? 'the whole organisation'
      : scope === 'department'
        ? 'your department'
        : scope === 'reports'
          ? 'your reporting line'
          : 'your team';

  return (
    <>
      <PageHeader
        title="Organisation chart"
        description={`Reporting hierarchy for ${scopeLabel}. CEO at the top, then managers, then their people.`}
        actions={
          <Input
            placeholder="Find a person…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="People visible" value={stats.people} hint={`scope: ${scope ?? 'own'}`} />
        <StatTile label="With direct reports" value={stats.managers} />
        <StatTile label="Levels deep" value={stats.depth} />
      </div>

      <Card className="mt-4" title="Reporting hierarchy" bodyClassName="p-3 sm:p-5">
        {!data?.data.length ? (
          <EmptyState
            title="No hierarchy to show"
            description="Set a manager on each employee to build the reporting tree."
          />
        ) : (
          <div className="overflow-x-auto">
            <ul className="min-w-[520px] space-y-1">
              {data.data.map((root) => (
                <OrgBranch
                  key={root.id}
                  node={root}
                  level={0}
                  search={search.trim().toLowerCase()}
                  collapsed={collapsed}
                  onToggle={toggle}
                  currentUserId={user?.id}
                />
              ))}
            </ul>
          </div>
        )}
      </Card>
    </>
  );
}

function OrgBranch({
  node,
  level,
  search,
  collapsed,
  onToggle,
  currentUserId,
}: {
  node: OrgNode;
  level: number;
  search: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  currentUserId?: string;
}) {
  const matches = (candidate: OrgNode): boolean => {
    if (!search) return true;
    const haystack = `${candidate.name} ${candidate.employeeCode} ${candidate.designation ?? ''} ${candidate.roleName}`;
    return (
      haystack.toLowerCase().includes(search) || candidate.children.some((child) => matches(child))
    );
  };

  // A search hides whole branches that contain no match, but keeps ancestors of
  // anyone who does match so the path to them stays readable.
  if (!matches(node)) return null;

  const isHit = search
    ? `${node.name} ${node.employeeCode} ${node.designation ?? ''}`.toLowerCase().includes(search)
    : false;
  const isCollapsed = collapsed.has(node.id) && !search;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={cx(
          'flex items-center gap-2.5 rounded-lg border px-3 py-2 transition',
          isHit ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
          node.id === currentUserId && 'ring-1 ring-brand-400',
        )}
        style={{ marginLeft: level * 22 }}
      >
        <button
          onClick={() => onToggle(node.id)}
          disabled={!hasChildren}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          className={cx(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400',
            hasChildren ? 'hover:bg-slate-200 hover:text-slate-700' : 'opacity-0',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={cx('h-3 w-3 transition-transform', !isCollapsed && 'rotate-90')}
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <Avatar size="sm" name={node.name} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/admin/employees/${node.id}`}
              className="truncate text-sm font-medium text-slate-800 hover:text-brand-700"
            >
              {node.name}
            </Link>
            <Badge tone={ROLE_TONES[node.roleKey] ?? ROLE_TONES.EMPLOYEE}>{node.roleName}</Badge>
            {node.id === currentUserId && <Badge tone="bg-brand-600 text-white ring-brand-600">You</Badge>}
          </div>
          <p className="truncate text-xs text-slate-500">
            {node.employeeCode}
            {node.designation ? ` · ${node.designation}` : ''}
            {node.department ? ` · ${node.department}` : ''}
          </p>
        </div>

        {hasChildren && (
          <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
            {node.directReports} direct
            {node.totalReports > node.directReports && ` · ${node.totalReports} total`}
          </span>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <ul className="mt-1 space-y-1">
          {node.children.map((child) => (
            <OrgBranch
              key={child.id}
              node={child}
              level={level + 1}
              search={search}
              collapsed={collapsed}
              onToggle={onToggle}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
