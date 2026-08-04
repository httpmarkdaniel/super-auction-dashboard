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
