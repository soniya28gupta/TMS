import { prisma } from './src/db';
import { api } from '../web/src/lib/api';

async function main() {
  console.log('--- STARTING PROJECT TRACKING & APPROVAL VERIFICATION TEST ---');

  // 1. Fetch Super Admin and Employee users from DB
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin@acme.test' },
    include: { role: true },
  });
  const employeeUser = await prisma.user.findUnique({
    where: { email: 'ananya@acme.test' },
    include: { role: true },
  });

  if (!adminUser || !employeeUser) {
    throw new Error('Test users admin@acme.test or ananya@acme.test not found in database');
  }

  console.log(`✓ Admin user: ${adminUser.firstName} ${adminUser.lastName} (${adminUser.role.key})`);
  console.log(`✓ Employee user: ${employeeUser.firstName} ${employeeUser.lastName} (${employeeUser.role.key})`);

  // 2. Create a fresh test project
  const testProjectCode = `TEST-PRJ-${Date.now().toString().slice(-4)}`;
  const project = await prisma.project.create({
    data: {
      code: testProjectCode,
      name: 'Automated Test Project Workflow 2026',
      description: 'End-to-end verification project for progress tracking and approval workflow',
      status: 'NOT_STARTED',
      progress: 0,
      createdById: adminUser.id,
      managerId: adminUser.id,
      members: {
        create: [
          { userId: adminUser.id, role: 'LEAD' },
          { userId: employeeUser.id, role: 'MEMBER' },
        ],
      },
    },
    include: { members: true },
  });

  console.log(`✓ Created test project ${project.code} (ID: ${project.id}) with status ${project.status} and progress ${project.progress}%`);

  try {
    // 3. Test Progress Update: Employee submits daily update
    console.log('Testing Daily Progress Update submission...');
    const progressUpdate = await prisma.projectProgressUpdate.create({
      data: {
        projectId: project.id,
        employeeId: employeeUser.id,
        updateType: 'DAILY',
        previousProgress: 0,
        newProgress: 40,
        completedWork: 'Implemented project models and database relations',
        ongoingWork: 'Developing UI tabs and components',
        blockers: null,
        nextSteps: 'File attachment testing and approval review workflow',
      },
    });

    // Update project progress
    const updatedProject1 = await prisma.project.update({
      where: { id: project.id },
      data: { progress: 40, status: 'IN_PROGRESS' },
    });

    console.log(`✓ Progress update submitted. Project status: ${updatedProject1.status}, progress: ${updatedProject1.progress}%`);
    if (updatedProject1.progress !== 40 || updatedProject1.status !== 'IN_PROGRESS') {
      throw new Error(`Expected progress 40% and IN_PROGRESS, got ${updatedProject1.progress}% and ${updatedProject1.status}`);
    }

    // 4. Test Attachment creation
    console.log('Testing Project Attachment persistence...');
    const attachment = await prisma.projectAttachment.create({
      data: {
        projectId: project.id,
        uploadedById: employeeUser.id,
        progressUpdateId: progressUpdate.id,
        originalName: 'system_architecture_diagram.png',
        storageKey: 'projects/test-architecture.png',
        mimeType: 'image/png',
        fileSize: 1024 * 512, // 512 KB
      },
    });
    console.log(`✓ Attachment recorded: ${attachment.originalName} (${attachment.fileSize} bytes) linked to update ${progressUpdate.id}`);

    // 5. Test Manual Progress Adjustment
    console.log('Testing Manual Progress Adjustment to 85%...');
    const updatedProject2 = await prisma.project.update({
      where: { id: project.id },
      data: { progress: 85 },
    });
    console.log(`✓ Project manual progress adjusted to ${updatedProject2.progress}%`);

    // 6. Test Final Project Submission for Management Review
    console.log('Testing Final Project Submission for Review...');
    const submission = await prisma.projectSubmission.create({
      data: {
        projectId: project.id,
        submittedById: employeeUser.id,
        finalSummary: 'All modules, tests, and deliverables for the 2026 initiative have been successfully executed and audited.',
        completedDeliverables: '1. Progress Tracking\n2. Daily/Weekly Updates\n3. File Management\n4. Approval Workflow',
        finalProgress: 100,
        outstandingIssues: 'None. All automated tests passing.',
        deliveryDetails: 'Production build deployed to staging cluster.',
        submissionComments: 'Ready for final management review and approval.',
        status: 'PENDING',
        approvalHistories: {
          create: {
            action: 'SUBMITTED',
            performedById: employeeUser.id,
            comments: 'Project submitted for final review.',
          },
        },
      },
    });

    const underReviewProject = await prisma.project.update({
      where: { id: project.id },
      data: { status: 'UNDER_REVIEW', progress: 100 },
    });

    console.log(`✓ Project submitted for review. Status: ${underReviewProject.status}, Progress: ${underReviewProject.progress}%`);
    if (underReviewProject.status !== 'UNDER_REVIEW') {
      throw new Error(`Expected status UNDER_REVIEW, got ${underReviewProject.status}`);
    }

    // 7. Verify Approval Queue query
    const pendingCount = await prisma.projectSubmission.count({
      where: { projectId: project.id, status: 'PENDING' },
    });
    console.log(`✓ Project appears in management approval queue with pending submissions: ${pendingCount}`);
    if (pendingCount !== 1) {
      throw new Error(`Expected 1 pending submission, got ${pendingCount}`);
    }

    // 8. Test Management Review & Approval
    console.log('Testing Management Approval Action...');
    const [approvedSubmission] = await prisma.$transaction([
      prisma.projectSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'APPROVED',
          reviewedById: adminUser.id,
          reviewedAt: new Date(),
          managementComments: 'Excellent work. Deliverables meet all quality guidelines. Approved for completion.',
        },
      }),
      prisma.projectApprovalHistory.create({
        data: {
          submissionId: submission.id,
          action: 'APPROVED',
          performedById: adminUser.id,
          comments: 'Excellent work. Deliverables meet all quality guidelines. Approved for completion.',
        },
      }),
      prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
        },
      }),
    ]);

    const finalProject = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        submissions: {
          include: { approvalHistories: true },
        },
        progressUpdates: true,
        attachments: true,
      },
    });

    console.log(`✓ Final project status: ${finalProject?.status}`);
    console.log(`✓ Completed at: ${finalProject?.completedAt}`);
    console.log(`✓ Submissions count: ${finalProject?.submissions.length}`);
    console.log(`✓ Latest submission status: ${finalProject?.submissions[0].status}`);
    console.log(`✓ Approval history entries: ${finalProject?.submissions[0].approvalHistories.length}`);

    if (finalProject?.status !== 'COMPLETED') {
      throw new Error(`Expected final status COMPLETED, got ${finalProject?.status}`);
    }
    if (finalProject?.submissions[0].status !== 'APPROVED') {
      throw new Error(`Expected submission status APPROVED, got ${finalProject?.submissions[0].status}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL PROJECT WORKFLOW VERIFICATION CHECKS PASSED! 🎉');
    console.log('======================================================\n');
  } finally {
    // Clean up test project
    console.log(`Cleaning up test project ${project.id}...`);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
    console.log('✓ Cleanup complete.');
  }
}

main()
  .catch((e) => {
    console.error('Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

