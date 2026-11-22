/**
 * The company's position catalogue.
 *
 * `level` is seniority and drives who may hire whom: **lower is more senior**.
 * The rule enforced in `canHirePosition()` is that you may only add someone
 * strictly more junior than yourself, which is what stops a Project Lead from
 * quietly creating another Manager.
 *
 * Bands group positions for the UI; tracks map them to a department.
 */

export const POSITION_BANDS = ['EXECUTIVE', 'MANAGEMENT', 'LEAD', 'IC'] as const;
export type PositionBand = (typeof POSITION_BANDS)[number];

export const POSITION_TRACKS = [
  'GENERAL',
  'ENGINEERING',
  'SALES',
  'FINANCE',
  'HR',
  'OPERATIONS',
] as const;
export type PositionTrack = (typeof POSITION_TRACKS)[number];

export type PositionSeed = {
  code: string;
  title: string;
  level: number;
  band: PositionBand;
  track: PositionTrack;
  /** Department code this position belongs to, or null for company-wide. */
  dept: string | null;
  canHire: boolean;
};

export const POSITION_CATALOGUE: PositionSeed[] = [
  // --- Executive ----------------------------------------------------------
  { code: 'CEO', title: 'Chief Executive Officer', level: 10, band: 'EXECUTIVE', track: 'GENERAL', dept: null, canHire: true },
  { code: 'CTO', title: 'Chief Technology Officer', level: 20, band: 'EXECUTIVE', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'CFO', title: 'Chief Financial Officer', level: 20, band: 'EXECUTIVE', track: 'FINANCE', dept: 'FIN', canHire: true },
  { code: 'COO', title: 'Chief Operating Officer', level: 20, band: 'EXECUTIVE', track: 'OPERATIONS', dept: 'OPS', canHire: true },
  { code: 'CHRO', title: 'Chief Human Resources Officer', level: 20, band: 'EXECUTIVE', track: 'HR', dept: 'HR', canHire: true },
  { code: 'VP_SALES', title: 'VP of Sales', level: 20, band: 'EXECUTIVE', track: 'SALES', dept: 'SLS', canHire: true },

  // --- Directors ----------------------------------------------------------
  { code: 'DIR_ENG', title: 'Director of Engineering', level: 30, band: 'MANAGEMENT', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'DIR_SALES', title: 'Director of Sales', level: 30, band: 'MANAGEMENT', track: 'SALES', dept: 'SLS', canHire: true },
  { code: 'DIR_FIN', title: 'Director of Finance', level: 30, band: 'MANAGEMENT', track: 'FINANCE', dept: 'FIN', canHire: true },
  { code: 'DIR_HR', title: 'Director of Human Resources', level: 30, band: 'MANAGEMENT', track: 'HR', dept: 'HR', canHire: true },
  { code: 'DIR_OPS', title: 'Director of Operations', level: 30, band: 'MANAGEMENT', track: 'OPERATIONS', dept: 'OPS', canHire: true },

  // --- Managers -----------------------------------------------------------
  { code: 'SR_MGR_ENG', title: 'Senior Engineering Manager', level: 40, band: 'MANAGEMENT', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'MGR_ENG', title: 'Engineering Manager', level: 50, band: 'MANAGEMENT', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'MGR_SALES', title: 'Sales Manager', level: 50, band: 'MANAGEMENT', track: 'SALES', dept: 'SLS', canHire: true },
  { code: 'MGR_FIN', title: 'Finance Manager', level: 50, band: 'MANAGEMENT', track: 'FINANCE', dept: 'FIN', canHire: true },
  { code: 'MGR_HR', title: 'HR Manager', level: 50, band: 'MANAGEMENT', track: 'HR', dept: 'HR', canHire: true },
  { code: 'MGR_OPS', title: 'Operations Manager', level: 50, band: 'MANAGEMENT', track: 'OPERATIONS', dept: 'OPS', canHire: true },
  { code: 'MGR_PRODUCT', title: 'Product Manager', level: 50, band: 'MANAGEMENT', track: 'ENGINEERING', dept: 'ENG', canHire: true },

  // --- Leads --------------------------------------------------------------
  { code: 'PROJECT_LEAD', title: 'Project Lead', level: 60, band: 'LEAD', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'TECH_LEAD', title: 'Technical Lead', level: 60, band: 'LEAD', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'TEAM_LEAD_QA', title: 'QA Lead', level: 60, band: 'LEAD', track: 'ENGINEERING', dept: 'ENG', canHire: true },
  { code: 'TEAM_LEAD_SALES', title: 'Sales Team Lead', level: 60, band: 'LEAD', track: 'SALES', dept: 'SLS', canHire: true },
  { code: 'LEAD_FIN', title: 'Finance Team Lead', level: 60, band: 'LEAD', track: 'FINANCE', dept: 'FIN', canHire: true },

  // --- Engineering ICs ----------------------------------------------------
  { code: 'PRINCIPAL_SWE', title: 'Principal Software Engineer', level: 65, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'STAFF_SWE', title: 'Staff Software Engineer', level: 68, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SR_SWE', title: 'Senior Software Engineer', level: 70, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SWE_III', title: 'Software Engineer III', level: 75, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SWE_II', title: 'Software Engineer II', level: 80, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SWE_I', title: 'Software Engineer I', level: 90, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'JR_SWE', title: 'Junior Software Engineer', level: 95, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SWE_INTERN', title: 'Software Engineering Intern', level: 100, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SR_QA', title: 'Senior QA Engineer', level: 70, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'QA_II', title: 'QA Engineer II', level: 80, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'QA_I', title: 'QA Engineer I', level: 90, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'SR_DEVOPS', title: 'Senior DevOps Engineer', level: 70, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'DEVOPS_II', title: 'DevOps Engineer II', level: 80, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'DATA_ANALYST', title: 'Data Analyst', level: 80, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },
  { code: 'UX_DESIGNER', title: 'UX Designer', level: 80, band: 'IC', track: 'ENGINEERING', dept: 'ENG', canHire: false },

  // --- Sales ICs ----------------------------------------------------------
  { code: 'SR_AE', title: 'Senior Account Executive', level: 70, band: 'IC', track: 'SALES', dept: 'SLS', canHire: false },
  { code: 'AE', title: 'Account Executive', level: 80, band: 'IC', track: 'SALES', dept: 'SLS', canHire: false },
  { code: 'SDR', title: 'Sales Development Representative', level: 90, band: 'IC', track: 'SALES', dept: 'SLS', canHire: false },
  { code: 'SALES_INTERN', title: 'Sales Intern', level: 100, band: 'IC', track: 'SALES', dept: 'SLS', canHire: false },

  // --- Finance ICs --------------------------------------------------------
  { code: 'FIN_CONTROLLER', title: 'Financial Controller', level: 55, band: 'MANAGEMENT', track: 'FINANCE', dept: 'FIN', canHire: true },
  { code: 'SR_ACCOUNTANT', title: 'Senior Accountant', level: 70, band: 'IC', track: 'FINANCE', dept: 'FIN', canHire: false },
  { code: 'ACCOUNTANT_II', title: 'Accountant II', level: 80, band: 'IC', track: 'FINANCE', dept: 'FIN', canHire: false },
  { code: 'ACCOUNTANT_I', title: 'Accountant I', level: 90, band: 'IC', track: 'FINANCE', dept: 'FIN', canHire: false },
  { code: 'FIN_EXEC', title: 'Finance Executive', level: 90, band: 'IC', track: 'FINANCE', dept: 'FIN', canHire: false },

  // --- HR ICs -------------------------------------------------------------
  { code: 'HRBP', title: 'HR Business Partner', level: 70, band: 'IC', track: 'HR', dept: 'HR', canHire: false },
  { code: 'SR_RECRUITER', title: 'Senior Recruiter', level: 75, band: 'IC', track: 'HR', dept: 'HR', canHire: false },
  { code: 'RECRUITER', title: 'Recruiter', level: 85, band: 'IC', track: 'HR', dept: 'HR', canHire: false },
  { code: 'HR_EXEC', title: 'HR Executive', level: 85, band: 'IC', track: 'HR', dept: 'HR', canHire: false },
  { code: 'HR_ASSOCIATE', title: 'HR Associate', level: 95, band: 'IC', track: 'HR', dept: 'HR', canHire: false },

  // --- Operations ICs -----------------------------------------------------
  { code: 'OPS_LEAD', title: 'Operations Lead', level: 60, band: 'LEAD', track: 'OPERATIONS', dept: 'OPS', canHire: true },
  { code: 'SR_OPS_EXEC', title: 'Senior Operations Executive', level: 75, band: 'IC', track: 'OPERATIONS', dept: 'OPS', canHire: false },
  { code: 'OPS_EXEC', title: 'Operations Executive', level: 85, band: 'IC', track: 'OPERATIONS', dept: 'OPS', canHire: false },
  { code: 'OFFICE_ADMIN', title: 'Office Administrator', level: 90, band: 'IC', track: 'GENERAL', dept: 'OPS', canHire: false },

  // --- Company-wide -------------------------------------------------------
  { code: 'EXEC_ASSISTANT', title: 'Executive Assistant', level: 85, band: 'IC', track: 'GENERAL', dept: null, canHire: false },
  { code: 'SYS_ADMIN', title: 'System Administrator', level: 55, band: 'IC', track: 'OPERATIONS', dept: 'OPS', canHire: false },
];

/** Seniority gap a hirer must clear. 0 would let peers hire peers. */
export const MIN_HIRING_GAP = 1;

export type PositionLike = { level: number; canHire: boolean; title: string };

/**
 * May someone holding `hirer` create an employee holding `candidate`?
 *
 * Two conditions: the hirer's position is flagged as able to hire at all, and
 * the candidate is strictly more junior. Returns a reason when it refuses so
 * the API can say why rather than just "forbidden".
 */
export function canHirePosition(
  hirer: PositionLike | null,
  candidate: PositionLike,
): { allowed: boolean; reason?: string } {
  if (!hirer) {
    return {
      allowed: false,
      reason: 'Your account has no position set, so it cannot add employees. Ask HR to assign one.',
    };
  }
  if (!hirer.canHire) {
    return {
      allowed: false,
      reason: `${hirer.title} is not a hiring position. Managers, leads and above can add employees.`,
    };
  }
  if (candidate.level < hirer.level + MIN_HIRING_GAP) {
    return {
      allowed: false,
      reason: `${hirer.title} cannot add a ${candidate.title} — you may only add positions more junior than your own.`,
    };
  }
  return { allowed: true };
}
