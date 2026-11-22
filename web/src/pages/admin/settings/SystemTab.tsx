import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Select,
  Spinner,
  cx,
} from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { useAuth } from '../../../lib/auth';
import type { SystemSettings } from '../../../lib/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

export default function SystemTab() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi<{ data: SystemSettings }>('/org/settings');
  const action = useAction();

  const [form, setForm] = useState<SystemSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.data) setForm(data.data);
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!form) return null;

  const canEdit = can('settings.manage');
  const canPrivacy = can('privacy.manage');
  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const save = async (keys: (keyof SystemSettings)[]) => {
    const payload = Object.fromEntries(keys.map((key) => [key, form[key]]));
    const result = await action.run(() => api.patch('/org/settings', payload));
    if (result) {
      setSaved(true);
      reload();
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const toggleDay = (day: number) =>
    set(
      'workingDays',
      form.workingDays.includes(day)
        ? form.workingDays.filter((d) => d !== day)
        : [...form.workingDays, day].sort(),
    );

  return (
    <div className="space-y-4">
      {action.error && <ErrorNote message={action.error} />}
      {saved && <InfoNote>Settings saved. Reminder schedules apply from the next scheduler tick.</InfoNote>}
      {!canEdit && <InfoNote tone="slate">You have read-only access to these settings.</InfoNote>}

      <Card
        title="Company & working week"
        actions={
          canEdit && (
            <Button
              size="sm"
              loading={action.busy}
              onClick={() =>
                void save(['companyName', 'timezone', 'workingDays', 'workStartTime', 'workEndTime', 'leaveYearStartMonth'])
              }
            >
              Save
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name">
            <Input
              disabled={!canEdit}
              value={form.companyName}
              onChange={(event) => set('companyName', event.target.value)}
            />
          </Field>
          <Field label="Timezone" hint="Every 'day' in the system is measured against this clock.">
            <Select
              disabled={!canEdit}
              value={form.timezone}
              onChange={(event) => set('timezone', event.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Work start">
            <Input
              type="time"
              disabled={!canEdit}
              value={form.workStartTime}
              onChange={(event) => set('workStartTime', event.target.value)}
            />
          </Field>
          <Field label="Work end">
            <Input
              type="time"
              disabled={!canEdit}
              value={form.workEndTime}
              onChange={(event) => set('workEndTime', event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4">
          <p className="label">Working days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={label}
                disabled={!canEdit}
                onClick={() => toggleDay(day)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed',
                  form.workingDays.includes(day)
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Non-working days are auto-skipped for SOD and EOD, and excluded from leave day counts.
          </p>
        </div>

        <div className="mt-4 max-w-xs">
          <Field label="Leave year starts in">
            <Select
              disabled={!canEdit}
              value={String(form.leaveYearStartMonth)}
              onChange={(event) => set('leaveYearStartMonth', Number(event.target.value))}
            >
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(
                (month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ),
              )}
            </Select>
          </Field>
        </div>
      </Card>

      <Card
        title="Attendance rules"
        actions={
          canEdit && (
            <Button
              size="sm"
              loading={action.busy}
              onClick={() => void save(['lateGraceMinutes', 'halfDayAfterMinutes', 'fullDayMinutes'])}
            >
              Save
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Late grace (minutes)" hint="Checked in after start + grace counts as late.">
            <Input
              type="number"
              min={0}
              max={240}
              disabled={!canEdit}
              value={form.lateGraceMinutes}
              onChange={(event) => set('lateGraceMinutes', Number(event.target.value))}
            />
          </Field>
          <Field label="Half day under (minutes)">
            <Input
              type="number"
              min={0}
              max={1440}
              disabled={!canEdit}
              value={form.halfDayAfterMinutes}
              onChange={(event) => set('halfDayAfterMinutes', Number(event.target.value))}
            />
          </Field>
          <Field label="Full day (minutes)">
            <Input
              type="number"
              min={0}
              max={1440}
              disabled={!canEdit}
              value={form.fullDayMinutes}
              onChange={(event) => set('fullDayMinutes', Number(event.target.value))}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Automation schedule"
        subtitle="Times are read on every tick — a change applies within a minute, with no restart"
        actions={
          canEdit && (
            <Button
              size="sm"
              loading={action.busy}
              onClick={() =>
                void save([
                  'sodGenerateTime',
                  'sodReminderTime',
                  'eodReminderTime',
                  'eodMissingCheckTime',
                  'dayCloseTime',
                  'autoAcceptTasks',
                  'requireEodReview',
                  'emailNotificationsEnabled',
                ])
              }
            >
              Save
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Generate SOD at" hint="Also runs recurring tasks.">
            <Input type="time" disabled={!canEdit} value={form.sodGenerateTime} onChange={(e) => set('sodGenerateTime', e.target.value)} />
          </Field>
          <Field label="SOD reminder at">
            <Input type="time" disabled={!canEdit} value={form.sodReminderTime} onChange={(e) => set('sodReminderTime', e.target.value)} />
          </Field>
          <Field label="EOD reminder at">
            <Input type="time" disabled={!canEdit} value={form.eodReminderTime} onChange={(e) => set('eodReminderTime', e.target.value)} />
          </Field>
          <Field label="Missing-EOD check at" hint="Escalates to the employee's manager.">
            <Input type="time" disabled={!canEdit} value={form.eodMissingCheckTime} onChange={(e) => set('eodMissingCheckTime', e.target.value)} />
          </Field>
          <Field label="Day close at" hint="Closes attendance, writes the daily record, purges expired data.">
            <Input type="time" disabled={!canEdit} value={form.dayCloseTime} onChange={(e) => set('dayCloseTime', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <Toggle
            label="Auto-accept assigned tasks"
            hint="Skip the Accept step; tasks land as Accepted."
            checked={form.autoAcceptTasks}
            disabled={!canEdit}
            onChange={(value) => set('autoAcceptTasks', value)}
          />
          <Toggle
            label="Require EOD review"
            hint="Notify supervisors when an EOD is submitted."
            checked={form.requireEodReview}
            disabled={!canEdit}
            onChange={(value) => set('requireEodReview', value)}
          />
          <Toggle
            label="Send email notifications"
            hint="In-app alerts always work. Turn this on once SMTP is configured."
            checked={form.emailNotificationsEnabled}
            disabled={!canEdit}
            onChange={(value) => set('emailNotificationsEnabled', value)}
          />
        </div>
      </Card>

      <Card
        title="Location & privacy policy"
        subtitle="Governs what may be captured at check-in, check-out and sign-in"
        actions={
          canPrivacy && (
            <Button
              size="sm"
              loading={action.busy}
              onClick={() =>
                void save([
                  'locationTrackingEnabled',
                  'locationPrecision',
                  'locationRetentionDays',
                  'sessionRetentionDays',
                  'locationConsentVersion',
                  'officeLatitude',
                  'officeLongitude',
                  'officeRadiusMeters',
                  'sessionIdleTimeoutMinutes',
                ])
              }
            >
              Save
            </Button>
          )
        }
      >
        {!canPrivacy && (
          <div className="mb-3">
            <InfoNote tone="slate">
              Changing these needs the <code className="font-mono">privacy.manage</code> permission.
            </InfoNote>
          </div>
        )}

        <div className="mb-4">
          <Toggle
            label="Capture location at check-in and check-out"
            hint="Off means no coordinate is stored for anyone, whatever a device sends."
            checked={form.locationTrackingEnabled}
            disabled={!canPrivacy}
            onChange={(value) => set('locationTrackingEnabled', value)}
          />
        </div>

        {form.locationTrackingEnabled && (
          <div className="mb-4">
            <InfoNote tone="amber">
              Employees must still accept the privacy notice individually before anything is
              recorded. Withdrawing consent erases what was already collected.
            </InfoNote>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Precision" hint="Approximate rounds to about 1 km.">
            <Select
              disabled={!canPrivacy}
              value={form.locationPrecision}
              onChange={(event) => set('locationPrecision', event.target.value)}
            >
              <option value="APPROXIMATE">Approximate (~1 km)</option>
              <option value="EXACT">Exact</option>
            </Select>
          </Field>
          <Field label="Keep locations for (days)">
            <Input
              type="number"
              min={1}
              max={3650}
              disabled={!canPrivacy}
              value={form.locationRetentionDays}
              onChange={(event) => set('locationRetentionDays', Number(event.target.value))}
            />
          </Field>
          <Field label="Keep sessions for (days)">
            <Input
              type="number"
              min={1}
              max={3650}
              disabled={!canPrivacy}
              value={form.sessionRetentionDays}
              onChange={(event) => set('sessionRetentionDays', Number(event.target.value))}
            />
          </Field>
          <Field label="Consent notice version" hint="Bumping this re-asks every employee.">
            <Input
              disabled={!canPrivacy}
              value={form.locationConsentVersion}
              onChange={(event) => set('locationConsentVersion', event.target.value)}
            />
          </Field>
          <Field label="Session idle timeout (minutes)">
            <Input
              type="number"
              min={5}
              max={20160}
              disabled={!canPrivacy}
              value={form.sessionIdleTimeoutMinutes}
              onChange={(event) => set('sessionIdleTimeoutMinutes', Number(event.target.value))}
            />
          </Field>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="label">Office geofence (optional)</p>
          <p className="mb-2 text-xs text-slate-500">
            Set a radius above 0 to record how far each punch was from the office. Where the
            inside/outside flag is enough, reviewers never need the coordinates.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Latitude">
              <Input
                type="number"
                step="0.000001"
                disabled={!canPrivacy}
                value={form.officeLatitude}
                onChange={(event) => set('officeLatitude', Number(event.target.value))}
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="0.000001"
                disabled={!canPrivacy}
                value={form.officeLongitude}
                onChange={(event) => set('officeLongitude', Number(event.target.value))}
              />
            </Field>
            <Field label="Radius (metres)" hint="0 disables the check.">
              <Input
                type="number"
                min={0}
                max={100000}
                disabled={!canPrivacy}
                value={form.officeRadiusMeters}
                onChange={(event) => set('officeRadiusMeters', Number(event.target.value))}
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={cx('flex items-start gap-3', disabled && 'opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
