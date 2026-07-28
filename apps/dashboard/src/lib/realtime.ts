import {
  REALTIME_EVENT,
  REALTIME_NAMESPACE,
  realtimeEventSchema,
  type RealtimeTopic,
} from '@madiro/shared';
import { useAuthStore } from '@madiro/web-core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/**
 * Which cached queries a change invalidates. Events carry no data (see the
 * shared contract), so the dashboard refetches through its normal authorized
 * endpoints — the socket only says "look again".
 */
export function queryKeysFor(topic: RealtimeTopic): string[][] {
  switch (topic) {
    case 'intake-draft':
    case 'intake-priced':
      // Queue, nav badge, stock table and the overview widgets all shift.
      return [['intake'], ['stock'], ['stats']];
    case 'sale':
    case 'return':
    case 'writeoff':
    case 'operation-cancelled':
      // Feed, KPIs, revenue chart and stock counts.
      return [['stats'], ['stock'], ['intake']];
  }
}

/**
 * Live dashboard (FR-B-04 / NFR-03): a draft scanned in the hall lands in the
 * queue, a sale lands in the feed, badges move — without a reload.
 *
 * The connection carries the current access token in its handshake and is
 * re-created whenever that token changes, so a refresh (or a logout) is
 * reflected on the socket instead of leaving a stale identity connected.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    const socket = io(`${API_BASE}${REALTIME_NAMESPACE}`, {
      // The token is read at connect time and at every reconnect attempt, so a
      // refreshed session reconnects with the new token rather than the old one.
      auth: (cb: (data: { token: string }) => void) =>
        cb({ token: useAuthStore.getState().accessToken ?? '' }),
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on(REALTIME_EVENT, (payload: unknown) => {
      const parsed = realtimeEventSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      for (const queryKey of queryKeysFor(parsed.data.topic)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });

    return () => {
      socket.close();
    };
  }, [accessToken, queryClient]);
}
