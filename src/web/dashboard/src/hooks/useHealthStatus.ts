import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { HealthStatusResponse } from '../api-types.js';
import { fetchHealthStatus } from '../api.js';

interface HealthState {
  data: HealthStatusResponse | null;
  error: boolean;
  lastUpdated: Date | null;
}

const HealthStatusContext = createContext<HealthState>({
  data: null,
  error: false,
  lastUpdated: null,
});

export function HealthStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HealthState>({ data: null, error: false, lastUpdated: null });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await fetchHealthStatus();
      setState({ data, error: false, lastUpdated: new Date() });
    } catch {
      setState(prev => ({ ...prev, error: true }));
    }
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  return React.createElement(HealthStatusContext.Provider, { value: state }, children);
}

export function useHealthStatus(): HealthState {
  return useContext(HealthStatusContext);
}
