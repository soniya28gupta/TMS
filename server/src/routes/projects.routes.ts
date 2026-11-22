import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse } from '../lib/http';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { authenticate, currentUser } from '../auth/middleware';
import { notify, notifyMany } from '../services/notification.service';
import { persistUpload, uploadTo, deleteStoredFile, sendStoredFile } from '../services/storage.service';
import { auditFromRequest } from '../services/audit.service';
import { PROJECT_STATUS, PROJECT_UPDATE_TYPE, PROJECT_SUBMISSION_STATUS } from '../constants';

export const projectsRouter = Router();
projectsRouter.use(authenticate);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  departmentId: z.string().optional(),
  search: z.string().optional(),
});

const createProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  status: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

const progressUpdateSchema = z.object({
  updateType: z.enum(['DAILY', 'WEEKLY']),
  newProgress: z.number().int().min(0).max(100),
  completedWork: z.string().min(5, 'Completed work details required (min 5 chars)'),
  ongoingWork: z.string().min(5, 'Ongoing work details required (min 5 chars)'),
  blockers: z.string().optional().nullable(),
  nextSteps: z.string().min(5, 'Next steps required (min 5 chars)'),
  additionalNotes: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).optional(),
});

const submissionSchema = z.object({
  finalSummary: z.string().min(10, 'Final summary must be at least 10 characters'),
  completedDeliverables: z.string().min(10, 'Completed deliverables details required (min 10 chars)'),
  finalProgress: z.number().int().min(0).max(100).default(100),
  outstandingIssues: z.string().optional().nullable(),
  deliveryDetails: z.string().optional().nullable(),
  submissionComments: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).optional(),
});

const reviewSubmissionSchema = z.object({
  action: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']),
  managementComments: z.string().min(5, 'Management feedback/comments are required (min 5 characters)'),
});

/** Sequential PRJ-000001 code generator */
async function nextProjectCode(): Promise<string> {
  const current = await prisma.setting.findUnique({ where: { key: 'projectSequence' } });
  const next = Number(current?.value ?? '0') + 1;
  await prisma.setting.upsert({
    where: { key: 'projectSequence' },
    create: { key: 'projectSequence', value: String(next) },
    update: { value: String(next) },
  });
  return `PRJ-${String(next).padStart(6, '0')}`;
}

async function getProjectForUser(user: any, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      department: true,
      manager: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true, email: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              avatarUrl: true,
              designation: true,
              role: { select: { key: true, name: true } },
            },
          },
        },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      progressUpdates: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              avatarUrl: true,
              role: { select: { key: true, name: true } },
            },
          },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      attachments: {
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeCode: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      submissions: {
        include: {
          submittedBy: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeCode: true },
          },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          attachments: true,
          approvalHistories: {
            include: {
              performedBy: {
                select: { id: true, firstName: true, lastName: true, avatarUrl: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!project) throw notFound('Project');

  const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);
  const isManager = project.managerId === user.id;
  const isCreator = project.createdById === user.id;
  const isMember = project.members.some((m) => m.userId === user.id);
  const isSameDepartment = Boolean(project.departmentId && user.departmentId === project.departmentId);

  if (!isSuper && !isManager && !isCreator && !isMember && !isSameDepartment) {
    throw forbidden('Not authorized to access this project');
  }

  return project;
}

// ---------------------------------------------------------------------------
// Project Statistics & Approval Queue (Admin / Manager)
// ---------------------------------------------------------------------------
projectsRouter.get(
  '/stats',
  handler(async (req, res) => {
    const user = currentUser(req);
    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);

    let projectWhere: any = {};
    if (!isSuper) {
      projectWhere = {
        OR: [
          { managerId: user.id },
          { createdById: user.id },
          { members: { some: { userId: user.id } } },
          user.departmentId ? { departmentId: user.departmentId } : undefined,
        ].filter(Boolean),
      };
    }

    const [
      total,
      notStarted,
      planning,
      inProgress,
      onHold,
      underReview,
      completed,
      rejected,
      pendingApprovals,
    ] = await Promise.all([
      prisma.project.count({ where: projectWhere }),
      prisma.project.count({ where: { ...projectWhere, status: 'NOT_STARTED' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'PLANNING' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'IN_PROGRESS' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'ON_HOLD' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'UNDER_REVIEW' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'COMPLETED' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'REJECTED' } }),
      prisma.projectSubmission.count({
        where: {
          status: 'PENDING',
          ...(isSuper ? {} : { project: projectWhere }),
        },
      }),
    ]);

    res.json({
      total,
      notStarted,
      planning,
      inProgress,
      onHold,
      underReview,
      completed,
      rejected,
      pendingApprovals,
    });
  }),
);

projectsRouter.get(
  '/admin/approvals',
  handler(async (req, res) => {
    const user = currentUser(req);
    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);
    const isManagerRole = ['MANAGER', 'TEAM_LEAD'].includes(user.roleKey);

    if (!isSuper && !isManagerRole) {
      throw forbidden('Only management and administrators can view approval queues');
    }

    const where: any = { status: 'PENDING' };
    if (!isSuper) {
      where.project = {
        OR: [{ managerId: user.id }, { createdById: user.id }],
      };
    }

    const submissions = await prisma.projectSubmission.findMany({
      where,
      include: {
        project: {
          include: {
            manager: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeCode: true, designation: true },
        },
        attachments: true,
        approvalHistories: {
          include: { performedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    res.json({ data: submissions });
  }),
);

// ---------------------------------------------------------------------------
// List Projects
// ---------------------------------------------------------------------------
projectsRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(listQuery, req.query);

    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);

    let projectWhere: any = {};
    if (!isSuper) {
      projectWhere = {
        OR: [
          { managerId: user.id },
          { createdById: user.id },
          { members: { some: { userId: user.id } } },
          user.departmentId ? { departmentId: user.departmentId } : undefined,
        ].filter(Boolean),
      };
    }

    if (q.status) projectWhere.status = q.status;
    if (q.departmentId) projectWhere.departmentId = q.departmentId;
    if (q.search) {
      projectWhere.AND = [
        {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { code: { contains: q.search, mode: 'insensitive' } },
            { description: { contains: q.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, projects] = await Promise.all([
      prisma.project.count({ where: projectWhere }),
      prisma.project.findMany({
        where: projectWhere,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          department: { select: { id: true, name: true, code: true } },
          manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          members: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true } },
            },
          },
          _count: { select: { tasks: true, members: true, progressUpdates: true, attachments: true } },
        },
      }),
    ]);

    res.json(paginated(projects, total, q.page, q.pageSize));
  }),
);

// ---------------------------------------------------------------------------
// Create Project
// ---------------------------------------------------------------------------
projectsRouter.post(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!user.permissions.has('*') && !['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(user.roleKey)) {
      throw forbidden('Only managers, team leads, or admins can create projects');
    }

    const body = parse(createProjectSchema, req.body);
    const code = await nextProjectCode();

    const project = await prisma.project.create({
      data: {
        code,
        name: body.name,
        description: body.description ?? null,
        departmentId: body.departmentId ?? user.departmentId ?? null,
        managerId: body.managerId ?? user.id,
        createdById: user.id,
        startDate: body.startDate ? new Date(body.startDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: body.status ?? 'NOT_STARTED',
        progress: body.progress ?? 0,
        members: {
          create: (body.memberIds ?? [user.id]).map((userId) => ({
            userId,
            role: userId === (body.managerId ?? user.id) ? 'LEAD' : 'MEMBER',
          })),
        },
      },
      include: {
        department: true,
        manager: true,
        createdBy: true,
        members: { include: { user: true } },
      },
    });

    await auditFromRequest(req, { action: 'project.create', entity: 'Project', entityId: project.id, meta: { code: project.code, name: project.name } });

    res.status(201).json(project);
  }),
);

// ---------------------------------------------------------------------------
// Get Single Project Detail
// ---------------------------------------------------------------------------
projectsRouter.get(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    res.json(project);
  }),
);

// ---------------------------------------------------------------------------
// Update Project Details & Manual Progress
// ---------------------------------------------------------------------------
projectsRouter.patch(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const body = parse(updateProjectSchema, req.body);

    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);
    const isManager = project.managerId === user.id || project.createdById === user.id;
    const isMember = project.members.some((m) => m.userId === user.id);

    if (!isSuper && !isManager && !isMember) {
      throw forbidden('Not authorized to update this project');
    }

    // Only managers/admins can modify core metadata (name, manager, dates)
    const isUpdatingMetadata =
      body.name !== undefined ||
      body.departmentId !== undefined ||
      body.managerId !== undefined ||
      body.startDate !== undefined ||
      body.dueDate !== undefined;

    if (isUpdatingMetadata && !isSuper && !isManager) {
      throw forbidden('Only project managers or administrators can edit project metadata');
    }

    // Setting status to COMPLETED directly is restricted to Management / Admin
    if (body.status === 'COMPLETED' && !isSuper && !isManager) {
      throw forbidden('Marking a project as Completed requires management approval');
    }

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId;
    if (body.managerId !== undefined) data.managerId = body.managerId;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (body.progress !== undefined) {
      data.progress = body.progress;
      // Auto-transition to IN_PROGRESS if progress started and project was NOT_STARTED or PLANNING
      if (body.progress > 0 && (project.status === 'NOT_STARTED' || project.status === 'PLANNING') && !body.status) {
        data.status = 'IN_PROGRESS';
      }
    }

    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === 'COMPLETED' && !project.completedAt) {
        data.completedAt = new Date();
      }
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data,
      include: {
        department: true,
        manager: true,
        createdBy: true,
        members: { include: { user: true } },
      },
    });

    if (body.progress !== undefined && body.progress !== project.progress) {
      const recipientIds = new Set<string>();
      if (project.managerId) recipientIds.add(project.managerId);
      if (project.createdById) recipientIds.add(project.createdById);
      recipientIds.delete(user.id);

      await notifyMany([...recipientIds], {
        type: 'PROJECT_PROGRESS_CHANGED',
        title: `Progress updated on ${project.name}`,
        body: `${user.firstName} updated progress to ${body.progress}%`,
        link: `/projects/${project.id}`,
      });
    }

    await auditFromRequest(req, {
      action: 'project.update',
      entity: 'Project',
      entityId: project.id,
      meta: { changes: body },
    });

    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// Add Daily / Weekly Progress Update
// ---------------------------------------------------------------------------
projectsRouter.post(
  '/:id/progress-updates',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const body = parse(progressUpdateSchema, req.body);

    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);
    const isManager = project.managerId === user.id || project.createdById === user.id;
    const isMember = project.members.some((m) => m.userId === user.id);

    if (!isSuper && !isManager && !isMember) {
      throw forbidden('You must be a member or manager of this project to submit updates');
    }

    const previousProgress = project.progress;
    const newProgress = body.newProgress;

    // Create progress update record
    const update = await prisma.projectProgressUpdate.create({
      data: {
        projectId: project.id,
        employeeId: user.id,
        updateType: body.updateType,
        previousProgress,
        newProgress,
        completedWork: body.completedWork,
        ongoingWork: body.ongoingWork,
        blockers: body.blockers ?? null,
        nextSteps: body.nextSteps,
        additionalNotes: body.additionalNotes ?? null,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            avatarUrl: true,
            role: { select: { key: true, name: true } },
          },
        },
        attachments: true,
      },
    });

    // Link any newly uploaded attachments to this progress update
    if (body.attachmentIds && body.attachmentIds.length > 0) {
      await prisma.projectAttachment.updateMany({
        where: {
          id: { in: body.attachmentIds },
          projectId: project.id,
        },
        data: {
          progressUpdateId: update.id,
        },
      });
    }

    // Automatically update project progress and status
    const projectUpdateData: any = { progress: newProgress };
    if (newProgress > 0 && (project.status === 'NOT_STARTED' || project.status === 'PLANNING')) {
      projectUpdateData.status = 'IN_PROGRESS';
    }
    await prisma.project.update({
      where: { id: project.id },
      data: projectUpdateData,
    });

    // Notify project manager and team members
    const recipientIds = new Set<string>();
    if (project.managerId) recipientIds.add(project.managerId);
    if (project.createdById) recipientIds.add(project.createdById);
    project.members.forEach((m) => recipientIds.add(m.userId));
    recipientIds.delete(user.id);

    await notifyMany([...recipientIds], {
      type: 'PROJECT_UPDATE_SUBMITTED',
      title: `${body.updateType === 'DAILY' ? 'Daily' : 'Weekly'} Update on ${project.name}`,
      body: `${user.firstName} submitted an update: Progress is now ${newProgress}%.`,
      link: `/projects/${project.id}`,
    });

    await auditFromRequest(req, {
      action: 'project.progress_update',
      entity: 'Project',
      entityId: project.id,
      meta: { updateId: update.id, updateType: body.updateType, newProgress },
    });

    res.status(201).json(update);
  }),
);

// ---------------------------------------------------------------------------
// File Upload & Attachment Management
// ---------------------------------------------------------------------------
projectsRouter.post(
  '/:id/attachments',
  ...uploadTo('projects'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw badRequest('No files uploaded');

    const progressUpdateId = typeof req.body.progressUpdateId === 'string' ? req.body.progressUpdateId : null;
    const submissionId = typeof req.body.submissionId === 'string' ? req.body.submissionId : null;

    const saved = await Promise.all(
      files.map(async (file) => {
        const storageKey = await persistUpload('projects', file);
        return prisma.projectAttachment.create({
          data: {
            projectId: project.id,
            uploadedById: user.id,
            progressUpdateId: progressUpdateId ?? null,
            submissionId: submissionId ?? null,
            originalName: file.originalname,
            storageKey,
            mimeType: file.mimetype,
            fileSize: file.size,
          },
          include: {
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        });
      }),
    );

    // Notify project manager if someone else uploaded files
    if (project.managerId && project.managerId !== user.id) {
      await notify({
        userId: project.managerId,
        type: 'PROJECT_ATTACHMENT_UPLOADED',
        title: `Files uploaded to ${project.name}`,
        body: `${user.firstName} uploaded ${saved.length} file(s) to ${project.name}.`,
        link: `/projects/${project.id}`,
      });
    }

    res.status(201).json({ data: saved });
  }),
);

projectsRouter.get(
  '/:id/attachments/:attachmentId/download',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const attachment = await prisma.projectAttachment.findUnique({
      where: { id: req.params.attachmentId },
    });

    if (!attachment || attachment.projectId !== project.id) {
      throw notFound('Attachment');
    }

    await sendStoredFile(res, attachment.storageKey, attachment.originalName);
  }),
);

projectsRouter.delete(
  '/:id/attachments/:attachmentId',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const attachment = await prisma.projectAttachment.findUnique({
      where: { id: req.params.attachmentId },
    });

    if (!attachment || attachment.projectId !== project.id) {
      throw notFound('Attachment');
    }

    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN'].includes(user.roleKey);
    const isManager = project.managerId === user.id;
    const isUploader = attachment.uploadedById === user.id;

    if (!isSuper && !isManager && !isUploader) {
      throw forbidden('You can only remove your own attachments');
    }

    await prisma.projectAttachment.delete({ where: { id: attachment.id } });
    await deleteStoredFile(attachment.storageKey);

    await auditFromRequest(req, {
      action: 'project.attachment_delete',
      entity: 'ProjectAttachment',
      entityId: attachment.id,
      meta: { filename: attachment.originalName },
    });

    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Final Project Submission for Review
// ---------------------------------------------------------------------------
projectsRouter.post(
  '/:id/submit',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const body = parse(submissionSchema, req.body);

    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);
    const isManager = project.managerId === user.id || project.createdById === user.id;
    const isMember = project.members.some((m) => m.userId === user.id);

    if (!isSuper && !isManager && !isMember) {
      throw forbidden('Only project members or managers can submit a project for review');
    }

    if (project.status === 'COMPLETED') {
      throw badRequest('This project is already completed');
    }

    // Check if there is already an active pending submission
    const existingPending = await prisma.projectSubmission.findFirst({
      where: { projectId: project.id, status: 'PENDING' },
    });
    if (existingPending) {
      throw badRequest('A submission is already pending management review for this project');
    }

    // Create Submission
    const submission = await prisma.projectSubmission.create({
      data: {
        projectId: project.id,
        submittedById: user.id,
        finalSummary: body.finalSummary,
        completedDeliverables: body.completedDeliverables,
        finalProgress: body.finalProgress,
        outstandingIssues: body.outstandingIssues ?? null,
        deliveryDetails: body.deliveryDetails ?? null,
        submissionComments: body.submissionComments ?? null,
        status: 'PENDING',
        approvalHistories: {
          create: {
            action: 'SUBMITTED',
            performedById: user.id,
            comments: body.submissionComments ?? 'Project submitted for final review.',
          },
        },
      },
      include: {
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeCode: true },
        },
        attachments: true,
        approvalHistories: {
          include: { performedBy: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    // Link any attachments provided
    if (body.attachmentIds && body.attachmentIds.length > 0) {
      await prisma.projectAttachment.updateMany({
        where: {
          id: { in: body.attachmentIds },
          projectId: project.id,
        },
        data: {
          submissionId: submission.id,
        },
      });
    }

    // Update project status to UNDER_REVIEW and sync final progress
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'UNDER_REVIEW',
        progress: body.finalProgress,
      },
    });

    // Notify Super Admin, HR Admin, and Project Manager
    const managementUsers = await prisma.user.findMany({
      where: {
        OR: [
          { role: { key: { in: ['SUPER_ADMIN', 'HR_ADMIN'] } } },
          project.managerId ? { id: project.managerId } : undefined,
        ].filter(Boolean) as any[],
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const recipientIds = new Set<string>(managementUsers.map((u) => u.id));
    recipientIds.delete(user.id);

    await notifyMany([...recipientIds], {
      type: 'PROJECT_SUBMITTED_FOR_REVIEW',
      title: `Project Submitted: ${project.name}`,
      body: `${user.firstName} submitted ${project.name} for final management review and approval.`,
      link: `/projects/${project.id}`,
      severity: 'WARNING',
    });

    await auditFromRequest(req, {
      action: 'project.submit_for_review',
      entity: 'Project',
      entityId: project.id,
      meta: { submissionId: submission.id, progress: body.finalProgress },
    });

    res.status(201).json(submission);
  }),
);

// ---------------------------------------------------------------------------
// Management Review & Approval Workflow
// ---------------------------------------------------------------------------
projectsRouter.post(
  '/:id/submissions/:submissionId/review',
  handler(async (req, res) => {
    const user = currentUser(req);
    const project = await getProjectForUser(user, req.params.id);
    const { submissionId } = req.params;
    const body = parse(reviewSubmissionSchema, req.body);

    const isSuper = user.permissions.has('*') || ['SUPER_ADMIN', 'HR_ADMIN', 'CEO'].includes(user.roleKey);
    const isManager = project.managerId === user.id;

    if (!isSuper && !isManager) {
      throw forbidden('Only management (Super Admin, HR Admin, or Project Manager) can review project submissions');
    }

    const submission = await prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { submittedBy: true },
    });

    if (!submission || submission.projectId !== project.id) {
      throw notFound('Project Submission');
    }

    if (submission.status !== 'PENDING') {
      throw badRequest('This submission has already been reviewed');
    }

    let nextProjectStatus: string;
    let nextProjectProgress = project.progress;
    let notificationType: any;
    let notificationTitle: string;
    let notificationBody: string;

    if (body.action === 'APPROVED') {
      nextProjectStatus = 'COMPLETED';
      nextProjectProgress = 100;
      notificationType = 'PROJECT_APPROVED';
      notificationTitle = `Project Approved: ${project.name}`;
      notificationBody = `Congratulations! ${project.name} has been approved by ${user.firstName} and marked Completed.`;
    } else if (body.action === 'CHANGES_REQUESTED') {
      nextProjectStatus = 'IN_PROGRESS';
      notificationType = 'PROJECT_CHANGES_REQUESTED';
      notificationTitle = `Changes Requested: ${project.name}`;
      notificationBody = `Changes have been requested for ${project.name}. Feedback: ${body.managementComments}`;
    } else {
      nextProjectStatus = 'REJECTED';
      notificationType = 'PROJECT_REJECTED';
      notificationTitle = `Project Rejected: ${project.name}`;
      notificationBody = `Project submission for ${project.name} was rejected. Reason: ${body.managementComments}`;
    }

    // Update Submission and create history
    const [updatedSubmission] = await prisma.$transaction([
      prisma.projectSubmission.update({
        where: { id: submission.id },
        data: {
          status: body.action,
          reviewedById: user.id,
          reviewedAt: new Date(),
          managementComments: body.managementComments,
        },
      }),
      prisma.projectApprovalHistory.create({
        data: {
          submissionId: submission.id,
          action: body.action,
          performedById: user.id,
          comments: body.managementComments,
        },
      }),
      prisma.project.update({
        where: { id: project.id },
        data: {
          status: nextProjectStatus,
          progress: nextProjectProgress,
          completedAt: body.action === 'APPROVED' ? new Date() : null,
        },
      }),
    ]);

    // Notify Submitter and all project members
    const recipientIds = new Set<string>();
    recipientIds.add(submission.submittedById);
    project.members.forEach((m) => recipientIds.add(m.userId));
    if (project.createdById) recipientIds.add(project.createdById);
    recipientIds.delete(user.id);

    await notifyMany([...recipientIds], {
      type: notificationType,
      title: notificationTitle,
      body: notificationBody,
      link: `/projects/${project.id}`,
      severity: body.action === 'APPROVED' ? 'INFO' : 'WARNING',
    });

    await auditFromRequest(req, {
      action: `project.review_${body.action.toLowerCase()}`,
      entity: 'ProjectSubmission',
      entityId: submission.id,
      meta: { action: body.action, comments: body.managementComments },
    });

    res.json(updatedSubmission);
  }),
);

// ---------------------------------------------------------------------------
// Add Member to Project
// ---------------------------------------------------------------------------
projectsRouter.post(
  '/:id/members',
  handler(async (req, res) => {
    const { id } = req.params;
    const user = currentUser(req);
    const body = parse(z.object({ userId: z.string(), role: z.string().default('MEMBER') }), req.body);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw notFound('Project');

    const canManage =
      user.permissions.has('*') ||
      project.managerId === user.id ||
      project.createdById === user.id ||
      ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'].includes(user.roleKey);

    if (!canManage) throw forbidden('Not authorized to add members to this project');

    const member = await prisma.teamProjectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: body.userId } },
      create: { projectId: id, userId: body.userId, role: body.role },
      update: { role: body.role },
      include: { user: true },
    });

    res.status(201).json(member);
  }),
);

// ---------------------------------------------------------------------------
// Remove Member from Project
// ---------------------------------------------------------------------------
projectsRouter.delete(
  '/:id/members/:userId',
  handler(async (req, res) => {
    const { id, userId } = req.params;
    await prisma.teamProjectMember.deleteMany({
      where: { projectId: id, userId },
    });
    res.status(204).end();
  }),
);
