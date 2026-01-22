import { prisma } from '../../core/database/prisma.client.js';

async function migrateExistingData() {
  console.log('🔄 Migrating existing installation data...\n');

  try {
    // Get all repositories with installation_ids
    const repos = await prisma.repositories.findMany({
      where: {
        installation_id: { not: null },
      },
      select: {
        id: true,
        full_name: true,
        owner_id: true,
        installation_id: true,
      },
    });

    console.log(`📦 Found ${repos.length} repositories with installations\n`);

    // Group by installation_id
    const installationMap = new Map();
    
    repos.forEach(repo => {
      const instId = repo.installation_id.toString();
      if (!installationMap.has(instId)) {
        installationMap.set(instId, []);
      }
      installationMap.get(instId).push(repo);
    });

    // Create installations
    for (const [installationId, repoList] of installationMap) {
      const firstRepo = repoList[0];
      
      console.log(`📥 Processing installation ${installationId}`);
      console.log(`   Owner: ${firstRepo.owner_id}`);
      console.log(`   Repos: ${repoList.length}`);

      // Create installation entry
      await prisma.installations.upsert({
        where: { installation_id: BigInt(installationId) },
        create: {
          installation_id: BigInt(installationId),
          owner_type: firstRepo.owner_id.includes('/') ? 'ORG' : 'USER',
          owner_id: firstRepo.owner_id,
          owner_login: firstRepo.owner_id,
          installed_scope: repoList.length > 1 ? 'org' : 'repo',
          created_at: new Date(),
          updated_at: new Date(),
        },
        update: {
          updated_at: new Date(),
        },
      });

      // Create installation_repos entries
      for (const repo of repoList) {
        await prisma.installation_repos.upsert({
          where: {
            installation_id_repo_id: {
              installation_id: BigInt(installationId),
              repo_id: repo.id,
            },
          },
          create: {
            installation_id: BigInt(installationId),
            repo_id: repo.id,
            repo_full_name: repo.full_name,
            is_active: true,
            added_at: new Date(),
          },
          update: {
            is_active: true,
          },
        });
        console.log(`   ✅ Added: ${repo.full_name}`);
      }
      console.log();
    }

    // Update repositories to enable paid features for testing
    await prisma.repositories.updateMany({
      where: {
        full_name: 'reporeply/reporeply-testing',
      },
      data: {
        is_paid: true,
        plan_tier: 'pro',
        realtime_enabled: true,
      },
    });

    console.log('🎉 Migration complete!\n');

    // Show summary
    const installationCount = await prisma.installations.count();
    const installationRepoCount = await prisma.installation_repos.count();

    console.log('📊 Summary:');
    console.log(`   Installations: ${installationCount}`);
    console.log(`   Installation Repos: ${installationRepoCount}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateExistingData();