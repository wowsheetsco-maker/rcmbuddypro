import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
  ref_claim_id: string | null;
}

const LIMIT = 50;

export function useNotifications() {
  const { userId } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("outstanding_notifications" as never)
        .select("id, type, title, message, read, created_at, ref_claim_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (cancelled) return;
      if (error) console.error("[notifications] load failed", error);
      else setItems((data ?? []) as unknown as AppNotification[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outstanding_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((cur) => [payload.new as AppNotification, ...cur].slice(0, LIMIT));
          } else if (payload.eventType === "UPDATE") {
            const upd = payload.new as AppNotification;
            setItems((cur) => cur.map((n) => (n.id === upd.id ? upd : n)));
          } else if (payload.eventType === "DELETE") {
            const del = payload.old as { id: string };
            setItems((cur) => cur.filter((n) => n.id !== del.id));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(
    async (id: string) => {
      let prev: AppNotification | undefined;
      setItems((cur) => {
        prev = cur.find((n) => n.id === id);
        return cur.map((n) => (n.id === id ? { ...n, read: true } : n));
      });
      const { error } = await supabase
        .from("outstanding_notifications" as never)
        .update({ read: true } as never)
        .eq("id", id);
      if (error) {
        console.error("[notifications] markRead failed", error);
        // Rollback so badge/list reflect server truth.
        if (prev) setItems((cur) => cur.map((n) => (n.id === id ? prev! : n)));
      }
    },
    [],
  );

  const markUnread = useCallback(
    async (id: string) => {
      let prev: AppNotification | undefined;
      setItems((cur) => {
        prev = cur.find((n) => n.id === id);
        return cur.map((n) => (n.id === id ? { ...n, read: false } : n));
      });
      const { error } = await supabase
        .from("outstanding_notifications" as never)
        .update({ read: false } as never)
        .eq("id", id);
      if (error) {
        console.error("[notifications] markUnread failed", error);
        if (prev) setItems((cur) => cur.map((n) => (n.id === id ? prev! : n)));
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    let snapshot: AppNotification[] = [];
    setItems((cur) => {
      snapshot = cur;
      return cur.map((n) => ({ ...n, read: true }));
    });
    const { error } = await supabase
      .from("outstanding_notifications" as never)
      .update({ read: true } as never)
      .eq("user_id", userId)
      .eq("read", false);
    if (error) {
      console.error("[notifications] markAllRead failed", error);
      setItems(snapshot);
    }
  }, [userId]);

  const unreadCount = items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  return { items, loading, unreadCount, markRead, markUnread, markAllRead };
}
