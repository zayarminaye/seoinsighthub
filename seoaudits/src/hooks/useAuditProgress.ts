'use client';

import { useEffect, useState, useRef } from 'react';

interface AuditProgress {
  auditId: string;
  status: string;
  currentStep: number | null;
  currentStepName: string | null;
  urlsProcessed: number;
  urlsTotal: number;
  percentComplete: number;
  timestamp: string;
}

export function useAuditProgress(auditId: string, enabled: boolean) {
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(`/api/audits/${auditId}/progress`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AuditProgress;
        setProgress(data);

        // Close connection when audit is done
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [auditId, enabled]);

  return progress;
}
