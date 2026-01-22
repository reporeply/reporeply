/**
 * scheduler/index.js
 * 
 * Purpose: Entry point to start the reminder scheduler
 */

import "./scheduler.service.js";

console.log("[Scheduler] Reminder scheduler module loaded");

export { getHealthStatus } from "./state.js";