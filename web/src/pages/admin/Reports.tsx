import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/Layout';
import { Button, Card, ErrorNote, Input, Select, Spinner, StatTile } from '../../components/ui';
import { api, downloadFile, queryString } from '../../lib/api';

type ReportKey = 'productivity' | 'tasks' | 'sod' | 'eod' | 'attendance';

export default function Reports() {
  const [reportType, setReportType] = useState<ReportKey>('productivity');
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const query = queryString({ from: fromDate, to: toDate });
      const res = await api.get<any>(`/reports/${reportType}${query}`);
      setReportData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, fromDate, toDate]);

  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    try {
      setDownloading(true);
      const query = queryString({ from: fromDate, to: toDate, format });
      await downloadFile(`/reports/${reportType}${query}`, `${reportType}-report.${format}`);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productivity & Compliance Reports"
        description="Generate comprehensive organizational performance reports, SOD/EOD submission logs, and export to Excel, PDF, or CSV."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" loading={downloading} onClick={() => handleExport('xlsx')}>
              ↓ Export to Excel (.xlsx)
            </Button>
            <Button variant="primary" loading={downloading} onClick={() => handleExport('pdf')}>
              ↓ Export to PDF (.pdf)
            </Button>
          </div>
        }
      />

      {/* Control Panel */}
      <Card bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Report Module</label>
            <Select value={reportType} onChange={(e: any) => setReportType(e.target.value)}>
              <option value="productivity">Employee Productivity Summary</option>
              <option value="tasks">Task Completion & On-Time Rate</option>
              <option value="sod">SOD Submission Compliance</option>
              <option value="eod">EOD Daily Report Compliance</option>
              <option value="attendance">Workforce Attendance & Punch Log</option>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Start Date</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">End Date</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={fetchReport}>Generate Report</Button>
          </div>
        </div>
      </Card>

      {/* Summary Tiles if provided */}
      {reportData?.summary && Object.keys(reportData.summary).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(reportData.summary).map(([key, val]) => (
            <StatTile
              key={key}
              label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
              value={String(val)}
              tone="text-brand-600"
            />
          ))}
        </div>
      )}

      {/* Report Data Table Preview */}
      <Card title={reportData?.title || 'Report Results'} subtitle={`Period: ${fromDate} to ${toDate}`}>
        {loading ? (
          <Spinner label="Generating analytical report..." />
        ) : error ? (
          <ErrorNote message={error} />
        ) : !reportData || !reportData.rows || reportData.rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No data records found for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {reportData.columns.map((col: any) => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.rows.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {reportData.columns.map((col: any) => (
                      <td key={col.key} className="px-4 py-3 text-xs text-slate-800 font-medium">
                        {String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
