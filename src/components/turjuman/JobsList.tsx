import { useEffect, useState, useCallback } from "react";
import { listJobs, type Job } from "../../lib/turjuman";
import JobRow from "./JobRow";

type Props = { refreshNonce: number };

export default function JobsList({ refreshNonce }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await listJobs();
      setJobs(list);
    } catch {
      /* refresh again next tick */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + refresh whenever NewJob says one was created.
  useEffect(() => {
    void refresh();
  }, [refresh, refreshNonce]);

  // Poll every 3s while at least one job is pending.
  useEffect(() => {
    const id = setInterval(() => {
      const pending = jobs.some(
        (j) => j.status === "queued" || j.status === "processing"
      );
      if (pending) void refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [jobs, refresh]);

  if (loading) return <p className="text-ink-400">جاري التحميل…</p>;
  if (jobs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink-700/60 p-6 text-center text-ink-500">
        لا توجد ترجمات بعد. الصق رابط بالأعلى للبدء.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <JobRow key={j.id} job={j} onTerminal={refresh} />
      ))}
    </div>
  );
}
