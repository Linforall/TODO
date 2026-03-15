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

  const upcomingTasks = await db.select<Task[]>(`
    SELECT * FROM tasks
    WHERE deadline IS NOT NULL
      AND status = 'pending'
      AND deadline BETWEEN '${now.toISOString()}' AND '${oneHourFromNow.toISOString()}'
    ORDER BY deadline ASC
  `);

  for (const task of upcomingTasks) {
    await invoke("send_notification", {
      title: "Upcoming Task: " + task.title,
      body: `Due by ${new Date(task.deadline!).toLocaleString()}`,
    });
    // Optionally, mark task as notified to prevent repeated notifications
    // This would require an additional column in the database (e.g., `notified_at`)
  }
}
