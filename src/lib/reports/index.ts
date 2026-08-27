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
  CURRENT_REPORT_TEMPLATE_VERSIONS,
  getLatestReportTemplate,
  getReportTemplate,
  getSubmissionGuidanceStatus,
  REPORT_AGENCIES,
  REPORT_TEMPLATE_LOCALES,
  reportTemplateReferenceSchema,
  reportTemplateSchema,
  resolveReportTemplate,
} from '@/lib/reports/template-registry';
export type {
  CaseFactKey,
  ImmutableReportTemplate,
  ReportTemplate,
  ReportTemplateLocale,
  ReportTemplateReference,
  SubmissionGuidanceStatus,
} from '@/lib/reports/template-registry';
