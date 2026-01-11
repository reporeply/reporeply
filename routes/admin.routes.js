import express from "express";
import { getAdminMetrics } from "../lib/adminMetrics.js";

const router = express.Router();

router.get("/metrics", async (_req, res) => {
  try {
    const metrics = await getAdminMetrics();
    res.json(metrics);
  } catch (err) {
    console.error("Admin metrics failed", err);
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

export default router;
