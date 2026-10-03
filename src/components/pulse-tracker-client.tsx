"use client";
import { useEffect } from "react";
type Client = { flush: () => void; destroy: () => void };
export function PulseTrackerClient({
  siteId,
  persistent,
}: {
  siteId: string;
  persistent: boolean;
}) {
  useEffect(() => {
    const target = window as unknown as {
      pulse?: Client;
      __axxesPulseGeneration?: number;
    };
    const generation = (target.__axxesPulseGeneration || 0) + 1;
    target.__axxesPulseGeneration = generation;
    let cancelled = false;
    let owned: Client | undefined;
    if (target.pulse) {
      target.pulse.flush();
      target.pulse.destroy();
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://pulse.axxes.app/pulse.v1.js";
    script.dataset.site = siteId;
    script.dataset.nativeGeneration = String(generation);
    script.dataset.performance = "true";
    if (persistent) {
      script.dataset.identity = "persistent";
      script.dataset.consent = "required";
    }
    script.onload = () => {
      if (cancelled || target.__axxesPulseGeneration !== generation) {
        return;
      } else owned = target.pulse;
    };
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      if (target.__axxesPulseGeneration === generation)
        target.__axxesPulseGeneration++;
      script.remove();
      if (owned && target.pulse === owned) {
        owned.flush();
        owned.destroy();
      }
    };
  }, [siteId, persistent]);
  return null;
}
