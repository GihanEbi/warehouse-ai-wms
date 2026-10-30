"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Result } from "@/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SubmitOptions<T> {
  /** toast message (or builder) shown on success; omit for no toast */
  success?: string | ((value: T) => string);
  /** simulated network latency in ms (default 350) */
  delay?: number;
  /** show an error toast on failure (default true) */
  errorToast?: boolean;
}

/**
 * Wraps a store transaction with:
 *  - a re-entrancy lock (double clicks / double submits are ignored),
 *  - a short simulated latency so the UI shows a processing state,
 *  - consistent success / error toasts.
 *
 * Usage:
 *   const { submit, pending } = useSubmit();
 *   const res = await submit(() => tx.approvePurchaseOrder(id), { success: "Approved" });
 *   if (res?.ok) ...
 */
export function useSubmit() {
  const lock = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = useCallback(async <T,>(fn: () => Result<T>, opts: SubmitOptions<T> = {}): Promise<Result<T> | null> => {
    if (lock.current) return null;
    lock.current = true;
    setPending(true);
    try {
      await sleep(opts.delay ?? 350);
      const res = fn();
      if (res.ok) {
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res.value) : opts.success);
      } else if (opts.errorToast !== false) {
        toast.error(res.error);
      }
      return res;
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  return { submit, pending };
}
