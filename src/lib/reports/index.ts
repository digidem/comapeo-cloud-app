export {
  approvedCaseFactInputSchema,
  buildCaseFacts,
  caseFactProvenanceSchema,
  caseFactSchema,
  caseFactsSchema,
  caseFactSourceInputSchema,
  caseFactValueSchema,
  missingCaseFactSchema,
} from '@/lib/reports/case-facts';
export type {
  ApprovedCaseFactInput,
  BuildCaseFactsInput,
  CaseFact,
  CaseFactProvenance,
  CaseFacts,
  CaseFactSourceInput,
  CaseFactSourceType,
  CaseFactValue,
  MissingCaseFact,
} from '@/lib/reports/case-facts';
export {
  BRAZIL_REPORT_TEMPLATES,
  CASE_FACT_KEYS,
  getLatestReportTemplate,
  getReportTemplate,
  getSubmissionGuidanceStatus,
  reportTemplateSchema,
} from '@/lib/reports/template-registry';
export type {
  CaseFactKey,
  ImmutableReportTemplate,
  ReportTemplate,
  SubmissionGuidanceStatus,
} from '@/lib/reports/template-registry';
