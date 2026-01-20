/**
 * Boolean Patterns Library
 *
 * Pre-built Boolean search patterns for common recruiting scenarios.
 * These patterns power the quick-insert dropdowns in the Boolean Query Editor
 * and can be used to enhance AI-generated queries.
 */

// =============================================================================
// TYPES
// =============================================================================

export type TitlePattern =
  | 'engineeringLeadership'
  | 'engineeringIC'
  | 'engineeringSeniorIC'
  | 'productManagement'
  | 'designLeadership'
  | 'designIC'
  | 'dataScience'
  | 'devOps'
  | 'salesLeadership'
  | 'salesIC'
  | 'marketing'
  | 'hr'
  | 'finance';

export type SkillPattern =
  | 'frontendSkills'
  | 'backendSkills'
  | 'fullstackSkills'
  | 'cloudSkills'
  | 'dataSkills'
  | 'mobileSkills'
  | 'aiMlSkills'
  | 'devOpsSkills'
  | 'securitySkills';

export type ExclusionPattern =
  | 'excludeForEngineering'
  | 'excludeForLeadership'
  | 'excludeForIC'
  | 'excludeForSenior'
  | 'excludeForJunior'
  | 'excludeRecruiters';

export type SeniorityPattern = 'seniorSignals' | 'juniorSignals' | 'leadershipSignals' | 'icSignals';

export type CompanyPattern = 'startupSignals' | 'enterpriseSignals' | 'faangCompanies' | 'topTechCompanies';

// =============================================================================
// PATTERN DEFINITIONS
// =============================================================================

/**
 * Title patterns by function/role type
 */
export const TITLE_PATTERNS: Record<TitlePattern, string[]> = {
  // Engineering Leadership
  engineeringLeadership: [
    '"Director of Engineering"',
    '"VP of Engineering"',
    '"VP Engineering"',
    '"Head of Engineering"',
    '"Engineering Director"',
    '"Chief Technology Officer"',
    'CTO',
    '"Chief Architect"',
    '"VP Technology"',
    '"SVP Engineering"',
  ],

  // Engineering ICs (Individual Contributors)
  engineeringIC: [
    '"Software Engineer"',
    '"Software Developer"',
    'Developer',
    'Programmer',
    '"Web Developer"',
    '"Application Developer"',
  ],

  // Senior Engineering ICs
  engineeringSeniorIC: [
    '"Senior Software Engineer"',
    '"Staff Engineer"',
    '"Staff Software Engineer"',
    '"Principal Engineer"',
    '"Principal Software Engineer"',
    '"Distinguished Engineer"',
    '"Senior Developer"',
    '"Lead Engineer"',
    '"Tech Lead"',
    '"Technical Lead"',
  ],

  // Product Management
  productManagement: [
    '"Product Manager"',
    '"Senior Product Manager"',
    '"Director of Product"',
    '"VP of Product"',
    '"VP Product"',
    '"Head of Product"',
    '"Chief Product Officer"',
    'CPO',
    '"Group Product Manager"',
    '"Principal Product Manager"',
  ],

  // Design Leadership
  designLeadership: [
    '"Design Director"',
    '"Head of Design"',
    '"VP of Design"',
    '"Chief Design Officer"',
    'CDO',
    '"Creative Director"',
    '"Director of UX"',
    '"Head of UX"',
  ],

  // Design ICs
  designIC: [
    '"UX Designer"',
    '"UI Designer"',
    '"Product Designer"',
    '"Senior Designer"',
    '"Visual Designer"',
    '"Interaction Designer"',
    '"UX Researcher"',
  ],

  // Data Science
  dataScience: [
    '"Data Scientist"',
    '"Senior Data Scientist"',
    '"Machine Learning Engineer"',
    '"ML Engineer"',
    '"AI Engineer"',
    '"Data Engineer"',
    '"Analytics Engineer"',
    '"Research Scientist"',
    '"Applied Scientist"',
  ],

  // DevOps/Infrastructure
  devOps: [
    '"DevOps Engineer"',
    '"Site Reliability Engineer"',
    'SRE',
    '"Platform Engineer"',
    '"Infrastructure Engineer"',
    '"Cloud Engineer"',
    '"Systems Engineer"',
    '"Release Engineer"',
  ],

  // Sales Leadership
  salesLeadership: [
    '"Sales Director"',
    '"VP of Sales"',
    '"VP Sales"',
    '"Head of Sales"',
    '"Chief Revenue Officer"',
    'CRO',
    '"Regional Sales Director"',
    '"Sales Manager"',
  ],

  // Sales ICs
  salesIC: [
    '"Account Executive"',
    '"Sales Representative"',
    '"Business Development Representative"',
    'BDR',
    'SDR',
    '"Sales Development Representative"',
    '"Enterprise Account Executive"',
  ],

  // Marketing
  marketing: [
    '"Marketing Manager"',
    '"Director of Marketing"',
    '"VP of Marketing"',
    'CMO',
    '"Chief Marketing Officer"',
    '"Growth Marketing"',
    '"Product Marketing Manager"',
    '"Content Marketing"',
    '"Digital Marketing"',
  ],

  // HR/People
  hr: [
    '"HR Manager"',
    '"People Operations"',
    '"Director of HR"',
    '"VP of HR"',
    '"Chief People Officer"',
    'CHRO',
    '"Talent Acquisition"',
    'Recruiter',
    '"HR Business Partner"',
  ],

  // Finance
  finance: [
    'CFO',
    '"Chief Financial Officer"',
    '"Finance Director"',
    '"VP Finance"',
    '"Controller"',
    '"Financial Analyst"',
    '"FP&A"',
  ],
};

/**
 * Skill patterns by domain
 */
export const SKILL_PATTERNS: Record<SkillPattern, string[]> = {
  frontendSkills: [
    'React',
    '"React.js"',
    'Vue',
    '"Vue.js"',
    'Angular',
    'TypeScript',
    'JavaScript',
    'CSS',
    'HTML',
    'Next.js',
    'Svelte',
  ],

  backendSkills: [
    'Node.js',
    'Python',
    'Java',
    'Go',
    'Golang',
    'Ruby',
    'Rust',
    'C#',
    '"C++"',
    'Scala',
    'Kotlin',
    'PHP',
  ],

  fullstackSkills: [
    '"Full Stack"',
    'Fullstack',
    '"MERN Stack"',
    '"MEAN Stack"',
    '"Node.js"',
    'React',
    'TypeScript',
  ],

  cloudSkills: [
    'AWS',
    '"Amazon Web Services"',
    'GCP',
    '"Google Cloud"',
    'Azure',
    '"Microsoft Azure"',
    'Kubernetes',
    'K8s',
    'Docker',
    'Terraform',
    'CloudFormation',
  ],

  dataSkills: [
    'SQL',
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'Elasticsearch',
    'Snowflake',
    'BigQuery',
    'Redshift',
    'Spark',
    'Kafka',
  ],

  mobileSkills: [
    'iOS',
    'Swift',
    'Android',
    'Kotlin',
    '"React Native"',
    'Flutter',
    'Dart',
    '"Mobile Development"',
    'Objective-C',
  ],

  aiMlSkills: [
    '"Machine Learning"',
    'ML',
    '"Deep Learning"',
    'TensorFlow',
    'PyTorch',
    'NLP',
    '"Natural Language Processing"',
    '"Computer Vision"',
    'LLM',
    '"Large Language Models"',
    'GPT',
    'Transformers',
  ],

  devOpsSkills: [
    'Docker',
    'Kubernetes',
    'K8s',
    'Jenkins',
    '"GitHub Actions"',
    'CircleCI',
    'Terraform',
    'Ansible',
    'Prometheus',
    'Grafana',
    'Datadog',
  ],

  securitySkills: [
    'Security',
    'Cybersecurity',
    '"Information Security"',
    'AppSec',
    '"Application Security"',
    'Penetration',
    'SIEM',
    'SOC',
    'IAM',
    '"Zero Trust"',
  ],
};

/**
 * Exclusion patterns - terms to filter OUT
 */
export const EXCLUSION_PATTERNS: Record<ExclusionPattern, string[]> = {
  // Exclude non-engineering roles when searching for engineering
  excludeForEngineering: [
    'Sales',
    'Marketing',
    'HR',
    'Recruiting',
    'Recruiter',
    'Finance',
    '"Account Executive"',
    '"Business Development"',
    '"Customer Success"',
  ],

  // Exclude ICs when searching for leadership
  excludeForLeadership: [
    'Intern',
    'Junior',
    '"Entry Level"',
    'Associate',
    '"Individual Contributor"',
    'IC',
  ],

  // Exclude managers when searching for ICs
  excludeForIC: [
    'Manager',
    'Director',
    'VP',
    '"Vice President"',
    '"Head of"',
    'Chief',
    'Lead',
    'Supervisor',
  ],

  // Exclude junior when searching for senior
  excludeForSenior: [
    'Junior',
    'Intern',
    '"Entry Level"',
    'Graduate',
    'Trainee',
    'Associate',
  ],

  // Exclude senior when searching for junior
  excludeForJunior: [
    'Senior',
    'Staff',
    'Principal',
    'Lead',
    'Director',
    'Manager',
    'VP',
    'Chief',
  ],

  // Exclude recruiters/HR when searching for technical roles
  excludeRecruiters: [
    'Recruiter',
    'Recruiting',
    '"Talent Acquisition"',
    'HR',
    '"Human Resources"',
    '"People Operations"',
    'Staffing',
  ],
};

/**
 * Seniority signal patterns
 */
export const SENIORITY_PATTERNS: Record<SeniorityPattern, string[]> = {
  seniorSignals: ['Senior', 'Lead', 'Principal', 'Staff', 'Architect', 'Distinguished'],

  juniorSignals: ['Junior', 'Associate', '"Entry Level"', 'Graduate', 'Trainee', 'I', 'II'],

  leadershipSignals: ['Manager', 'Director', 'VP', 'Head', 'Chief', 'President', 'Lead'],

  icSignals: ['Engineer', 'Developer', 'Designer', 'Analyst', 'Specialist', 'Scientist'],
};

/**
 * Company type patterns
 */
export const COMPANY_PATTERNS: Record<CompanyPattern, string[]> = {
  startupSignals: [
    'Startup',
    '"Series A"',
    '"Series B"',
    '"Series C"',
    '"Early Stage"',
    '"Venture Backed"',
    'YC',
    '"Y Combinator"',
  ],

  enterpriseSignals: [
    'Fortune',
    'Enterprise',
    '"Large Scale"',
    'Global',
    'Corporate',
    'F500',
    '"Fortune 500"',
  ],

  faangCompanies: ['Google', 'Meta', 'Facebook', 'Amazon', 'Apple', 'Netflix', 'Microsoft'],

  topTechCompanies: [
    'Google',
    'Meta',
    'Amazon',
    'Apple',
    'Microsoft',
    'Netflix',
    'Salesforce',
    'Adobe',
    'Oracle',
    'IBM',
    'Uber',
    'Airbnb',
    'Stripe',
    'Shopify',
    'Twitter',
    'LinkedIn',
    'Snap',
  ],
};

// =============================================================================
// QUERY BUILDERS
// =============================================================================

/**
 * Build a Boolean query from title pattern + skills + exclusions
 */
export function buildPatternQuery(
  titlePattern: TitlePattern,
  skills?: SkillPattern[],
  exclude?: ExclusionPattern
): string {
  const parts: string[] = [];

  // 1. Title section
  const titles = TITLE_PATTERNS[titlePattern];
  if (titles && titles.length > 0) {
    parts.push(`(${titles.join(' OR ')})`);
  }

  // 2. Skills section
  if (skills && skills.length > 0) {
    const allSkills = skills.flatMap((s) => SKILL_PATTERNS[s] || []);
    if (allSkills.length > 0) {
      // Dedupe skills
      const uniqueSkills = Array.from(new Set(allSkills));
      parts.push(`(${uniqueSkills.join(' OR ')})`);
    }
  }

  // 3. Exclusions
  if (exclude) {
    const exclusions = EXCLUSION_PATTERNS[exclude];
    if (exclusions && exclusions.length > 0) {
      parts.push(`NOT (${exclusions.join(' OR ')})`);
    }
  }

  // Combine with AND
  return parts.join(' AND ');
}

/**
 * Build a query string from an array of terms (handles quoting multi-word terms)
 */
export function buildTermGroup(terms: string[], operator: 'AND' | 'OR' = 'OR'): string {
  const formattedTerms = terms.map((term) => {
    // Already quoted
    if (term.startsWith('"') && term.endsWith('"')) {
      return term;
    }
    // Needs quoting (has spaces)
    if (term.includes(' ')) {
      return `"${term}"`;
    }
    return term;
  });

  return `(${formattedTerms.join(` ${operator} `)})`;
}

/**
 * Get all patterns for a category
 */
export function getPatterns(
  category: 'titles' | 'skills' | 'exclusions' | 'seniority' | 'company'
): Record<string, string[]> {
  switch (category) {
    case 'titles':
      return TITLE_PATTERNS;
    case 'skills':
      return SKILL_PATTERNS;
    case 'exclusions':
      return EXCLUSION_PATTERNS;
    case 'seniority':
      return SENIORITY_PATTERNS;
    case 'company':
      return COMPANY_PATTERNS;
    default:
      return {};
  }
}

/**
 * Get pattern names for UI dropdowns
 */
export function getPatternLabels(category: 'titles' | 'skills' | 'exclusions'): { value: string; label: string }[] {
  const labelMap: Record<string, string> = {
    // Titles
    engineeringLeadership: 'Engineering Leadership',
    engineeringIC: 'Engineering IC',
    engineeringSeniorIC: 'Senior Engineering IC',
    productManagement: 'Product Management',
    designLeadership: 'Design Leadership',
    designIC: 'Design IC',
    dataScience: 'Data Science',
    devOps: 'DevOps/SRE',
    salesLeadership: 'Sales Leadership',
    salesIC: 'Sales IC',
    marketing: 'Marketing',
    hr: 'HR/People',
    finance: 'Finance',

    // Skills
    frontendSkills: 'Frontend',
    backendSkills: 'Backend',
    fullstackSkills: 'Full Stack',
    cloudSkills: 'Cloud/Infrastructure',
    dataSkills: 'Data/Databases',
    mobileSkills: 'Mobile',
    aiMlSkills: 'AI/ML',
    devOpsSkills: 'DevOps',
    securitySkills: 'Security',

    // Exclusions
    excludeForEngineering: 'Non-Engineering Roles',
    excludeForLeadership: 'IC/Junior Roles',
    excludeForIC: 'Management Roles',
    excludeForSenior: 'Junior Roles',
    excludeForJunior: 'Senior Roles',
    excludeRecruiters: 'Recruiters/HR',
  };

  let patterns: Record<string, string[]>;
  switch (category) {
    case 'titles':
      patterns = TITLE_PATTERNS;
      break;
    case 'skills':
      patterns = SKILL_PATTERNS;
      break;
    case 'exclusions':
      patterns = EXCLUSION_PATTERNS;
      break;
    default:
      patterns = {};
  }

  return Object.keys(patterns).map((key) => ({
    value: key,
    label: labelMap[key] || key,
  }));
}
