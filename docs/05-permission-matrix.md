# 5 · Roles, Hierarchy & Permission Matrix

There are two portals — Admin and Employee — exactly as the brief specifies. There is no
separate Manager portal: managers and team leaders sign into the Admin portal and see a
reduced set of screens, decided by their permissions.

---

## The organisational hierarchy

Access is shaped by two independent things:

- **Role** — *what kind of actions* you may take (create tasks, approve leave, edit
  settings).
- **Reporting line** — *whose data* those actions may touch.

The reporting chain is CEO → Manager → Employee, at any depth:

```
Kavita Menon · CEO
├── Rahul Verma · Engineering Manager
│   └── Sneha Iyer · Team Lead
│       ├── Ananya Rao · Engineer
│       ├── Karan Mehta · Engineer
│       └── Divya Kulkarni · QA
├── Farah Qureshi · Sales Manager
│   ├── Rohit Gupta
│   └── Meera Joshi
├── Priya Nair · HR Admin
│   └── Neha Bansal
├── Vikram Singh · Finance
└── Arjun Pillai · Operations
```

Rahul sees Sneha, Ananya, Karan and Divya — and nobody in Sales, HR or Finance. Kavita
sees everyone. This holds across every screen: employee lists, tasks, SOD/EOD, attendance,
leave approvals, reports, org chart and login activity.

Implementation: each user stores a materialised `hierarchyPath` (`/ceo/manager/self/`), so
"everyone under X" is a single indexed prefix query. Cycles are rejected when a manager is
changed. See `server/src/services/hierarchy.service.ts`.

---

## Positions vs roles — and who may hire

Two separate things govern a person:

| | Decides | Examples |
| --- | --- | --- |
| **Role** | *What actions* they may take | Super Admin, CEO, HR Admin, Manager, Team Leader, Employee |
| **Position** | *Where they sit* in the company, by seniority | Junior Software Engineer, Software Engineer I/II/III, Senior Software Engineer, Project Lead, Engineering Manager, Director, CxO |

Positions live in a catalogue (`server/src/positions.ts`, seeded into the
`Position` table) covering every department — Engineering, Sales, Finance, HR and
Operations. Each carries a **`level`**, where **lower is more senior**:

```
 10  Chief Executive Officer
 20  CTO · CFO · COO · CHRO · VP Sales
 30  Directors
 50  Managers (Engineering, Sales, Finance, HR, Operations, Product)
 60  Project Lead · Technical Lead · QA Lead · Sales Team Lead
 65–70  Principal / Staff / Senior engineers, Senior AE, Senior Accountant
 75–80  Software Engineer III / II, QA II, DevOps II, Account Executive
 90–95  Software Engineer I, Junior Software Engineer, SDR, Accountant I
100  Interns
```

### The hiring rule

Adding an employee requires **both** checks to pass:

1. **Capability** — the role holds `employee.create` (Super Admin, CEO, HR Admin,
   Manager, Team Leader).
2. **Seniority** — the hirer's position is flagged `canHire`, and the new hire's
   position is *strictly more junior* than their own.

Then the placement is constrained too:

- The new hire reports to the person adding them, or to someone already inside
  that person's reporting line — never outside it.
- The chosen manager must themselves outrank the new hire.

So a **Project Lead (60)** can add a Software Engineer II (80) or a Junior
Software Engineer (95), but not another Project Lead, and not an Engineering
Manager. An **Engineering Manager (50)** can add the Project Lead — but only
beneath themselves, never into the Sales branch.

A **Senior Software Engineer (70)** cannot add anyone: the position is not a
hiring position, and the Employee role lacks `employee.create` regardless.

The Super Admin is a system account rather than a position holder and bypasses
the seniority check — it exists to bootstrap the tree and repair it.

The API refuses with the *reason*, not just a 403:

> Project Lead cannot add a Engineering Manager — you may only add positions
> more junior than your own.

`GET /positions/hireable` returns only the positions and managers the caller may
actually pick, so the form cannot offer a choice the API would then reject.

---

## Scopes

Every data-reading permission ends in a scope. The system grants the widest one the role
holds.

| Scope | Resolves to |
| --- | --- |
| `own` | Only the signed-in user's own records |
| `team` | Members of teams they belong to or lead, plus direct reports |
| `reports` | Their entire reporting subtree, at any depth |
| `department` | Everyone in their department |
| `all` | The whole organisation |

`reports` is the one that implements "managers see only their reporting line". It is
distinct from `department` on purpose: a manager's line may span departments, and a
department may contain people who do not report to them.

---

## Default roles

| Role | Portal | Data scope | Purpose |
| --- | --- | --- | --- |
| **Super Admin** | Admin | Everything (`*`) | System owner: roles, settings, integrations |
| **CEO** | Admin | `all` | Full visibility of people and work, without system administration |
| **HR Admin** | Admin | `all` | Employee lifecycle, attendance, leave, documents, privacy policy |
| **Manager** | Admin | `reports` | Their reporting line: assign, review, approve |
| **Team Leader** | Admin | `team` | Assign and review work for their team |
| **Finance** | Admin | `all` (read) + payroll | Read-only workforce data plus payroll |
| **Employee** | Employee | `own` | Their own work, attendance, leave and profile |

**Super Admin vs CEO.** They are separated deliberately. The CEO needs to see all work and
all people; they do not need to edit permission matrices or SMTP credentials. Keeping
system administration in a distinct role means the most powerful business account is not
also the most dangerous technical one.

Roles are rows in the database, not constants in code. A Super Admin can create roles and
retune permissions from **Settings → Roles** without a deploy. The only guard rail: the
Super Admin role cannot have its wildcard removed, or the system could lock itself out.

---

## Permission matrix

Legend — ● full · ◐ scoped to their line/team · ○ own only · — none

| Capability | Super Admin | CEO | HR Admin | Manager | Team Lead | Finance | Employee |
| --- | :--: | :--: | :--: | :--: | :--: | :--: | :--: |
| **Employees** |
| View employees | ● | ● | ● | ◐ | ◐ | ● | ○ |
| Create / edit employees | ● | ● | ● | — | — | — | ○ profile |
| Deactivate, reset password | ● | — | ● | — | — | — | — |
| View org chart | ● | ● | ● | ◐ | ◐ | ● | ● |
| Change reporting lines | ● | ● | ● | — | — | — | — |
| **Tasks** |
| View tasks | ● | ● | ● | ◐ | ◐ | — | ○ |
| Create / assign | ● | ● | ● | ◐ | ◐ | — | — |
| Update task | ● | ● | ● | ◐ | ◐ | — | ○ |
| Reassign | ● | ● | ● | ◐ | ◐ | — | — |
| Review / approve | ● | ● | ● | ◐ | ◐ | — | — |
| Cancel | ● | ● | ● | ◐ | — | — | — |
| Recurring & templates | ● | ● | ● | ◐ | ◐ | — | — |
| **SOD / EOD** |
| View SOD / EOD | ● | ● | ● | ◐ | ◐ | — | ○ |
| Submit own | ● | ● | ● | ● | ● | ● | ● |
| Add own entries | ● | ● | ● | ● | ● | ● | ● |
| **Assign SOD duties** | ● | ● | ● | ◐ | ◐ | — | — |
| Review EOD | ● | ● | ● | ◐ | ◐ | — | — |
| **Attendance** |
| View attendance | ● | ● | ● | ◐ | ◐ | ● | ○ |
| Check in / out | ● | ● | ● | ● | ● | ● | ● |
| Edit records | ● | — | ● | — | — | — | — |
| Request correction | ● | ● | ● | ● | ● | ● | ● |
| Approve correction | ● | — | ● | ◐ | — | — | — |
| **Leave** |
| View leave | ● | ● | ● | ◐ | ◐ | ● | ○ |
| Apply | ● | ● | ● | ● | ● | ● | ● |
| Approve / reject | ● | ● | ● | ◐ | — | — | — |
| Manage types & balances | ● | — | ● | — | — | — | — |
| **Activity & location** |
| View login sessions | ● | ● | ● | ◐ | ◐ | — | ○ |
| Sign a device out | ● | — | ● | — | — | — | ○ |
| View captured locations | ● | ● | ● | ◐ | — | — | ○ |
| Configure privacy policy | ● | — | ● | — | — | — | — |
| **Reports** |
| View reports | ● | ● | ● | ◐ | ◐ | ● | ○ |
| Export Excel / PDF / CSV | ● | ● | ● | ◐ | ◐ | ● | — |
| Payroll data | ● | — | — | — | — | ● | — |
| **Administration** |
| Departments & teams | ● | ● | ● | — | — | — | — |
| Roles & permissions | ● | — | — | — | — | — | — |
| System settings | ● | ○ read | ○ read | — | — | ○ read | — |
| Holiday calendar | ● | — | ● | — | — | — | — |
| Audit log | ● | ● | — | — | — | — | — |
| Announcements | ● | ● | ● | — | — | — | — |

---

## Guarantees this enforces

The brief's section 14 asks for specific properties. Each is enforced server-side, and
each has a test in `server/tests/`:

| Requirement | How it is enforced |
| --- | --- |
| Employees access only their own information | Employee role holds only `.own` scopes; every list query is filtered by resolved scope before it reaches the database |
| Employees cannot view others' private information | `assertCanTouchUser` on every by-id route; a request outside scope returns `403` |
| Employees cannot access company-wide HR reports | Report endpoints resolve `report.read`; an Employee's widest scope is `own` |
| Task changes follow configured permissions | `assertCanUpdateTask` checks assignee, creator, then scope; transitions validated against a table |
| Salary/payroll restricted | `payroll.read` is held only by Finance and Super Admin |
| Permissions configurable via RBAC | Stored in `RolePermission`; editable in the UI; validated against the catalogue |
| Managers restricted to their reporting line | Manager role uses `reports` scope, resolved through the materialised hierarchy path |

Two implementation notes worth stating plainly:

**Authorisation is server-side.** The UI hides what you cannot use, but that is
convenience, not security. Every route independently resolves permissions and scope; a
crafted request from a signed-in employee gets `403`.

**Scope filters the query, not the response.** Lists are filtered in the `where` clause
rather than fetched and stripped afterwards, so out-of-scope rows are never loaded, never
counted in pagination totals, and never leak through an aggregate.
