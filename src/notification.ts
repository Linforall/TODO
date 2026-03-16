import { invoke } from "@tauri-apps/api/core";
import { getDb, Task } from "./db"; // Assuming Task interface is also in db.ts or a shared type file

interface NotificationPermission {
  kind: "granted" | "denied" | "default";
}

// Request notification permission if not already granted
async function requestNotificationPermission(): Promise<NotificationPermission> {
  const permission = await invoke("notification:permission_state");
  if (permission === "granted") return { kind: "granted" };
  return { kind: "granted" }; // For now, assume granted on default if not explicitly denied
}

export async function checkAndSendNotifications() {
  const permission = await requestNotificationPermission();
  if (permission.kind !== "granted") {
    console.warn("Notification permission not granted.");
    return;
  }

  const db = await getDb();
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000); // Tasks due in the next hour

  const upcomingTasks = await db.select<Task[]>(
    `SELECT * FROM tasks
     WHERE deadline IS NOT NULL
       AND status = ?
       AND deadline BETWEEN ? AND ?
     ORDER BY deadline ASC`,
    ['pending', now.toISOString(), oneHourFromNow.toISOString()]
  );

  // 并行发送通知
  await Promise.all(upcomingTasks.map(task =>
    invoke("send_notification", {
      title: "Upcoming Task: " + task.title,
      body: `Due by ${new Date(task.deadline!).toLocaleString()}`,
    })
  ));
}
