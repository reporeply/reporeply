import express from "express";

import metricsRoutes from "./modules/metrics/metrics.routes.js";
import trendsRoutes from "./modules/trends/trends.routes.js";
import reposRoutes from "./modules/repos/repos.routes.js";

const router = express.Router();

// /admin/metrics
router.use("/metrics", metricsRoutes);

// /admin/trends
router.use("/trends", trendsRoutes);

// /admin/repos/:repoId
router.use("/repos", reposRoutes);

export default router;