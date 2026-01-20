import express from "express";
import { prisma } from "../../../../core/database/prisma.client.js";

const router = express.Router();

console.log("[Routes]  ✅ repos.routes.js loaded");

// GET /admin/repos - List all repositories
router.get("/", async (req, res) => {
  try {
    console.log("📦 GET /admin/repos called");
    
    const repos = await prisma.repositories.findMany({
      include: {
        users: {
          select: {
            username: true,
            type: true
          }
        },
        _count: {
          select: {
            reminders: true,
            ai_usage: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    console.log(`✅ Found ${repos.length} repositories`);
    res.json(repos);
  } catch (error) {
    console.error("❌ Error in GET /admin/repos:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to fetch repositories"
    });
  }
});

// GET /admin/repos/:repoId - Get specific repository with details
router.get("/:repoId", async (req, res) => {
  try {
    console.log(`📦 GET /admin/repos/${req.params.repoId} called`);
    
    const repo = await prisma.repositories.findUnique({
      where: {
        id: req.params.repoId
      },
      include: {
        users: true,
        reminders: {
          orderBy: {
            created_at: 'desc'
          },
          take: 50
        },
        ai_usage: {
          orderBy: {
            month: 'desc'
          }
        },
        repo_features: {
          include: {
            features: true
          }
        }
      }
    });
    
    if (!repo) {
      console.log(`❌ Repository ${req.params.repoId} not found`);
      return res.status(404).json({ 
        error: "Repository not found",
        repoId: req.params.repoId
      });
    }
    
    console.log(`✅ Found repository: ${repo.full_name}`);
    res.json(repo);
  } catch (error) {
    console.error(`❌ Error in GET /admin/repos/${req.params.repoId}:`, error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to fetch repository details"
    });
  }
});

export default router;