import express from "express";
import cors from "cors";
import adminRoutes from "../src/routes/admin.routes.js";

export function setupMiddleware(app) {
  app.use(cors({
    origin: [
      "https://reporeply.vercel.app",
      "https://coderxrohan.engineer"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }));

  app.use(express.json());
  app.use("/admin", adminRoutes);
}
