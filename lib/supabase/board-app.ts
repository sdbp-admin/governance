import { supabase } from "@/lib/supabase/client";

export type BoardCounts = { chat: number; forMe: number };

export async function loadBoardCounts(): Promise<BoardCounts> {
  const { data, error } = await supabase.rpc("board_app_counts");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { chat: Number(row?.chat_count ?? 0), forMe: Number(row?.for_me_count ?? 0) };
}

export async function markBoardChatSeen(throughAt: string) {
  const { error } = await supabase.rpc("mark_board_chat_seen", { through_at: throughAt });
  if (error) throw error;
}

export async function registerBoardWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/governance/board-sw.js", { scope: "/governance/board/" });
}

export function showBoardBadge(count: number) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then(registration => {
    registration.active?.postMessage({ type: "BOARD_BADGE", count });
  });
}

export async function enableBoardPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Push notifications are not supported here. On iPhone, add Board to the Home Screen and open that app.");
  }
  // iOS requires the permission prompt to remain directly inside the user's tap.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are not allowed for Board on this device.");
  const registration = await registerBoardWorker();
  if (!registration) throw new Error("Could not start Board notifications on this device.");
  const { data, error } = await supabase.functions.invoke("board-push-config");
  if (error) throw error;
  const key = String(data?.publicKey ?? "");
  if (!key) throw new Error("Board push is not configured yet.");
  let subscription = await registration.pushManager.getSubscription();
  const currentKey = subscription?.options.applicationServerKey;
  if (subscription && currentKey && toBase64Url(new Uint8Array(currentKey)) !== key) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Incomplete push subscription.");
  const saved = await supabase.rpc("register_board_push_subscription", {
    push_endpoint: json.endpoint, push_p256dh: json.keys.p256dh, push_auth: json.keys.auth,
  });
  if (saved.error) throw saved.error;
}

export async function disableBoardPush() {
  const registration = await registerBoardWorker();
  if (!registration || !("PushManager" in window)) return;
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await supabase.rpc("unregister_board_push_subscription", { push_endpoint: subscription.endpoint });
  if (error) throw error;
  await subscription.unsubscribe();
}

export async function boardPushEnabled() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || Notification.permission !== "granted") return false;
  const registration = await registerBoardWorker();
  return Boolean(await registration?.pushManager.getSubscription());
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(bytes, char => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
