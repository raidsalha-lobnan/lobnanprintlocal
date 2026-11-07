import { useEffect, useState } from 'react';

import { EntityName, LocalView } from './types';
import { UnifiedRepository } from './repository';

import {
  SyncCoordinator,
  SyncState
} from './coordinator';

export function useUnifiedCollection(
  repository: UnifiedRepository,
  entity: EntityName
) {
  const [rows, setRows] = useState<LocalView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let sequence = 0;

    const refresh = () => {
      const current = ++sequence;

      void repository.all(entity)
        .then(data => {
          if (active && current === sequence) {
            setRows(data);
            setError(null);
          }
        })
        .catch(err => {
          if (active) setError(String(err));
        });
    };

    const unsubscribe = repository.subscribe(refresh);

    refresh();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, entity]);

  return { rows, error };
}

export function useSyncStatus(
  sync: SyncCoordinator
): SyncState {
  const [state, setState] = useState<SyncState>({
    running: false,
    pending: 0,
    conflict: 0,
    lastSuccessAt: null,
    lastError: null,
    isLeader: false
  });

  useEffect(
    () => sync.onState(setState),
    [sync]
  );

  return state;
}
