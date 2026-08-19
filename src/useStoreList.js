// MOCKED — real fetch disconnected, see src/mockApiData.js. Restore fetch() below to re-wire.
// Returning null makes the caller fall back to mockData.js's static
// STORE_OPTIONS list, which is already exactly what's wanted here.
export function useStoreList() {
  return null;
}

/* Original live implementation:
import { useEffect, useState } from "react";

// Real distinct store/branch names from ClickHouse, for the store
// dropdown. Falls back to null (caller uses the mock list) until loaded.
export function useStoreList() {
  const [stores, setStores] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stores")
      .then((res) => {
        if (!res.ok) throw new Error(`stores API returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStores(data.stores || []);
      })
      .catch(() => {
        if (!cancelled) setStores(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return stores;
}
*/
