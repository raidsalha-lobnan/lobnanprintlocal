export async function assessLocalStorageHealth() {
  const idbAvailable =
    typeof indexedDB !== 'undefined';

  if (
    typeof navigator === 'undefined' ||
    !navigator.storage
  ) {
    return {
      idbAvailable,
      persistent: null,
      quotaBytes: null,
      usageBytes: null
    };
  }

  const estimate = await navigator.storage
    .estimate()
    .catch(() => ({
      quota: undefined,
      usage: undefined
    }));

  const persistent = await navigator.storage
    .persisted()
    .catch(() => null);

  return {
    idbAvailable,
    persistent,
    quotaBytes: estimate.quota ?? null,
    usageBytes: estimate.usage ?? null
  };
}

export async function requestPersistentStorage() {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage?.persist
  ) {
    return false;
  }

  return navigator.storage.persist().catch(() => false);
}
