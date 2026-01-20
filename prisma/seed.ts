/**
 * Prisma Seed Script - Creates development tenant and initial data
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create development tenant
  const devTenant = await prisma.tenant.upsert({
    where: { slug: 'development' },
    update: {},
    create: {
      name: 'Development Tenant',
      slug: 'development',
      status: 'AUTONOMOUS',
      config: {
        companyName: 'Riley Development',
        industry: 'Technology',
        defaultTimezone: 'America/Los_Angeles',
      },
    },
  });

  console.log(`Created/updated development tenant: ${devTenant.id} (${devTenant.slug})`);

  // Create initial guidelines for development tenant
  const existingGuidelines = await prisma.guidelines.findFirst({
    where: { tenantId: devTenant.id, status: 'ACTIVE' },
  });

  if (!existingGuidelines) {
    const guidelines = await prisma.guidelines.create({
      data: {
        tenantId: devTenant.id,
        version: 1,
        status: 'ACTIVE',
        createdBy: 'SYSTEM',
        workflows: [
          {
            id: 'sourcing-workflow',
            name: 'LinkedIn Sourcing',
            type: 'SOURCING',
            steps: [
              { id: 'step-1', action: 'Search LinkedIn', description: 'Execute Boolean search query' },
              { id: 'step-2', action: 'Score Candidates', description: 'AI-powered candidate scoring' },
              { id: 'step-3', action: 'Generate Outreach', description: 'Create personalized messages' },
            ],
          },
        ],
        templates: [
          {
            id: 'connection-request',
            name: 'LinkedIn Connection Request',
            type: 'OUTREACH',
            channel: 'LINKEDIN',
            content: 'Hi {{firstName}}, I noticed your background in {{domain}} and thought you might be interested in a {{roleTitle}} opportunity. Would love to connect!',
          },
        ],
        decisionTrees: [],
        constraints: [
          {
            id: 'daily-outreach-limit',
            name: 'Daily Outreach Limit',
            type: 'RATE_LIMIT',
            maxValue: 50,
            period: 'DAY',
          },
        ],
        changelog: 'Initial guidelines created during seeding',
      },
    });
    console.log(`Created initial guidelines: ${guidelines.id}`);
  }

  // Create initial criteria for development tenant
  const existingCriteria = await prisma.criteria.findFirst({
    where: { tenantId: devTenant.id, status: 'ACTIVE' },
  });

  if (!existingCriteria) {
    const criteria = await prisma.criteria.create({
      data: {
        tenantId: devTenant.id,
        version: 1,
        status: 'ACTIVE',
        createdBy: 'SYSTEM',
        qualityStandards: [
          {
            id: 'response-rate',
            name: 'Target Response Rate',
            metric: 'RESPONSE_RATE',
            target: 20,
            unit: 'PERCENTAGE',
          },
          {
            id: 'time-to-fill',
            name: 'Time to Fill',
            metric: 'TIME_TO_FILL',
            target: 45,
            unit: 'DAYS',
          },
        ],
        evaluationRubrics: [
          {
            id: 'technical-fit',
            name: 'Technical Fit',
            weight: 30,
            criteria: ['Relevant skills', 'Experience level', 'Industry background'],
          },
          {
            id: 'culture-fit',
            name: 'Culture Fit',
            weight: 20,
            criteria: ['Communication style', 'Values alignment', 'Team dynamics'],
          },
        ],
        successPatterns: [],
        failurePatterns: [],
        changelog: 'Initial criteria created during seeding',
      },
    });
    console.log(`Created initial criteria: ${criteria.id}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
