import { useState } from "react";
import { apiRequest } from "@/api/client";

/**
 * Hook for triggering auto timetable regeneration after data changes.
 * Returns: { checkAndRegenerate, regenerating, regenerationResult, clearResult }
 */
export function useAutoRegenerate() {
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationResult, setRegenerationResult] = useState(null);

  const checkAndRegenerate = async (trigger) => {
    setRegenerating(true);
    try {
      const res = await apiRequest("/import/auto-regenerate", {
        method: "POST",
        body: JSON.stringify({ trigger }),
      });
      setRegenerationResult(res?.data ?? null);
    } catch (err) {
      setRegenerationResult({ error: err.message || "Auto-regeneration failed." });
    } finally {
      setRegenerating(false);
    }
  };

  const clearResult = () => setRegenerationResult(null);

  return { checkAndRegenerate, regenerating, regenerationResult, clearResult };
}
