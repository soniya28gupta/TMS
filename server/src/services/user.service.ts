import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { readNumberArray } from '../lib/json';

export const USER_INCLUDE = {
  role: { select: { id: true, key: true, name: true, portal: true } },
  position: {
    select: { id: true, title: true, code: true, level: true, band: true, track: true, canHire: true },
  },
  department: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  teamMemberships: { include: { team: { select: { id: true, name: true } } } },
} satisfies Prisma.UserInclude;

type UserWithIncludes = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

/** Public-facing employee shape. Never contains the password hash. */
export function toUserDto(user: UserWithIncludes) {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    position: user.position,
    department: user.department,
    manager: user.manager,
    teams: user.teamMemberships.map((m) => m.team),
    // Falls back to the position title so older records without a free-text
    // designation still show something meaningful.
    designation: user.designation ?? user.position?.title ?? null,
    employmentType: user.employmentType,
    workMode: user.workMode,
    dateOfJoining: user.dateOfJoining,
    dateOfBirth: user.dateOfBirth,
    gender: user.gender,
    address: user.address,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    shiftStart: user.shiftStart,
    shiftEnd: user.shiftEnd,
    workingDays: readNumberArray(user.workingDays, [1, 2, 3, 4, 5]),
    timezone: user.timezone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function getUserDto(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
  return user ? toUserDto(user) : null;
}

/** Next free employee code, e.g. EMP013. */
export async function nextEmployeeCode(): Promise<string> {
  const last = await prisma.user.findFirst({
    orderBy: { employeeCode: 'desc' },
    select: { employeeCode: true },
  });
  const digits = last?.employeeCode.match(/(\d+)$/)?.[1];
  const next = digits ? Number(digits) + 1 : 1;
  return `EMP${String(next).padStart(3, '0')}`;
}
