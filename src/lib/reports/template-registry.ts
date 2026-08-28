import * as v from 'valibot';

import type { CaseAgency, CaseType } from '@/lib/db';
import type { Locale } from '@/stores/locale-store';

export const CASE_FACT_KEYS = [
  'case.title',
  'case.primaryType',
  'case.secondaryTypes',
  'case.context',
  'incident.date',
  'incident.dateRange',
  'incident.chronology',
  'incident.recurrence',
  'location.summary',
  'location.geometry',
  'people.communityContext',
  'impact.threats',
  'impact.environmentalDamage',
  'impact.affectedResources',
  'actors.documented',
  'equipment.documented',
  'action.requested',
  'urgency.context',
  'evidence.summary',
] as const;

export type CaseFactKey = (typeof CASE_FACT_KEYS)[number];

type ExhaustiveCaseTypes<T extends readonly CaseType[]> =
  Exclude<CaseType, T[number]> extends never ? T : never;

function defineExhaustiveCaseTypes<const T extends readonly CaseType[]>(
  types: ExhaustiveCaseTypes<T>,
): T {
  return types;
}

export const REPORT_CASE_TYPES = defineExhaustiveCaseTypes([
  'invasion_occupation',
  'territorial_encroachment',
  'deforestation_logging',
  'illegal_mining',
  'fire',
  'wildlife_exploitation',
  'pollution_contamination',
  'threats_violence',
  'rights_violation',
  'other',
] as const);

export const REPORT_AGENCIES = [
  'FUNAI',
  'IBAMA',
  'MPF',
  'PF',
] as const satisfies readonly CaseAgency[];
const LOCALES = ['en', 'pt', 'es'] as const satisfies readonly Locale[];
export type ReportTemplateLocale = (typeof LOCALES)[number];

export const CURRENT_REPORT_TEMPLATE_VERSIONS = Object.freeze({
  FUNAI: '1.0.0',
  IBAMA: '1.0.0',
  MPF: '1.0.0',
  PF: '1.0.0',
} as const satisfies Record<CaseAgency, string>);

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const nonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.nonEmpty());
const httpsUrlSchema = v.pipe(
  v.string(),
  v.check(isHttpsUrl, 'Expected HTTPS URL'),
);
const isoDateSchema = v.pipe(
  v.string(),
  v.check(isIsoDate, 'Expected YYYY-MM-DD date'),
);
const localizedTextSchema = v.object({
  en: nonEmptyStringSchema,
  pt: nonEmptyStringSchema,
  es: nonEmptyStringSchema,
});

const caseTypeSchema = v.picklist(REPORT_CASE_TYPES);
const caseFactKeySchema = v.picklist(CASE_FACT_KEYS);
const agencySchema = v.picklist(REPORT_AGENCIES);

const reportTemplateObjectSchema = v.object({
  templateId: v.pipe(v.string(), v.regex(/^br\.[a-z]+\.report$/)),
  version: v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+$/)),
  country: v.literal('BR'),
  agency: agencySchema,
  agencyName: nonEmptyStringSchema,
  outputLanguage: v.literal('pt-BR'),
  supportedCaseTypes: v.pipe(v.array(caseTypeSchema), v.minLength(1)),
  requiredFacts: v.array(caseFactKeySchema),
  optionalFacts: v.array(caseFactKeySchema),
  sections: v.pipe(
    v.array(
      v.object({
        id: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]*$/)),
        title: nonEmptyStringSchema,
        required: v.boolean(),
      }),
    ),
    v.minLength(1),
  ),
  drafting: v.object({
    instructions: v.pipe(v.array(nonEmptyStringSchema), v.minLength(1)),
    standardWording: v.array(nonEmptyStringSchema),
    legalReferences: v.array(
      v.object({
        label: nonEmptyStringSchema,
        wording: nonEmptyStringSchema,
      }),
    ),
    mayDiagnoseLegalViolation: v.literal(false),
    mayConcludeOffense: v.literal(false),
  }),
  disclosureReviewPrompt: localizedTextSchema,
  submission: v.object({
    channel: v.picklist(['fala-br', 'mpf-servicos', 'comunica-pf']),
    guidance: localizedTextSchema,
    verifyWarning: localizedTextSchema,
    destinationUrl: httpsUrlSchema,
    officialSourceUrl: httpsUrlSchema,
  }),
  lastReviewedAt: isoDateSchema,
});

function hasUniqueItems(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isInternallyConsistentTemplate(
  template: v.InferOutput<typeof reportTemplateObjectSchema>,
): boolean {
  const expectedTemplateId = `br.${template.agency.toLowerCase()}.report`;
  const requiredFacts = new Set(template.requiredFacts);

  return (
    template.templateId === expectedTemplateId &&
    hasUniqueItems(template.supportedCaseTypes) &&
    hasUniqueItems(template.requiredFacts) &&
    hasUniqueItems(template.optionalFacts) &&
    hasUniqueItems(template.sections.map((section) => section.id)) &&
    !template.optionalFacts.some((fact) => requiredFacts.has(fact))
  );
}

export const reportTemplateSchema = v.pipe(
  reportTemplateObjectSchema,
  v.check(
    isInternallyConsistentTemplate,
    'Report template identity and fact lists must be internally consistent',
  ),
);

export type ReportTemplate = v.InferOutput<typeof reportTemplateSchema>;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type ImmutableReportTemplate = DeepReadonly<ReportTemplate>;

export const reportTemplateReferenceSchema = v.object({
  templateId: v.pipe(v.string(), v.regex(/^br\.[a-z]+\.report$/)),
  version: v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+$/)),
  agency: agencySchema,
});

export type ReportTemplateReference = v.InferOutput<
  typeof reportTemplateReferenceSchema
>;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const ALL_CASE_TYPES = [...REPORT_CASE_TYPES];

const commonDisclosurePrompt = {
  en: 'Review identities, people, locations, photos, audio, and other sensitive fields before this agency report uses them.',
  pt: 'Revise identidades, pessoas, localizações, fotos, áudios e outros campos sensíveis antes de usá-los neste relatório para a agência.',
  es: 'Revise identidades, personas, ubicaciones, fotos, audios y otros campos sensibles antes de usarlos en este informe para la agencia.',
};

const verifyWarning = {
  en: 'Official submission guidance may change. Verify the current instructions at the official source before submitting.',
  pt: 'As orientações oficiais de envio podem mudar. Verifique as instruções atuais na fonte oficial antes de enviar.',
  es: 'Las orientaciones oficiales de envío pueden cambiar. Verifique las instrucciones actuales en la fuente oficial antes de enviar.',
};

const rawTemplates: ReportTemplate[] = [
  {
    templateId: 'br.funai.report',
    version: '1.0.0',
    country: 'BR',
    agency: 'FUNAI',
    agencyName: 'Fundação Nacional dos Povos Indígenas (Funai)',
    outputLanguage: 'pt-BR',
    supportedCaseTypes: ALL_CASE_TYPES,
    requiredFacts: ['case.title', 'case.primaryType', 'impact.threats'],
    optionalFacts: [
      'case.secondaryTypes',
      'case.context',
      'incident.date',
      'incident.dateRange',
      'people.communityContext',
      'incident.chronology',
      'incident.recurrence',
      'location.summary',
      'location.geometry',
      'urgency.context',
      'evidence.summary',
      'action.requested',
    ],
    sections: [
      { id: 'identificacao', title: 'Identificação do relato', required: true },
      { id: 'contexto', title: 'Povos, território e contexto', required: true },
      { id: 'fatos', title: 'Fatos, ameaças e impactos', required: true },
      { id: 'evidencias', title: 'Evidências disponíveis', required: false },
      {
        id: 'providencias',
        title: 'Providências solicitadas',
        required: false,
      },
    ],
    drafting: {
      instructions: [
        'Relate somente fatos presentes nos Case Facts fornecidos.',
        'Destaque povos, território, ameaças ou impactos e urgência quando documentados.',
        'Não conclua que houve crime, infração, intenção, autoria ou enquadramento legal.',
      ],
      standardWording: [],
      legalReferences: [],
      mayDiagnoseLegalViolation: false,
      mayConcludeOffense: false,
    },
    disclosureReviewPrompt: commonDisclosurePrompt,
    submission: {
      channel: 'fala-br',
      guidance: {
        en: 'FUNAI directs ombudsman complaints and other manifestations through the federal Fala.BR platform.',
        pt: 'A Funai orienta que denúncias e demais manifestações de Ouvidoria sejam registradas pela plataforma federal Fala.BR.',
        es: 'FUNAI orienta que las denuncias y otras manifestaciones de la Defensoría se registren mediante la plataforma federal Fala.BR.',
      },
      verifyWarning,
      destinationUrl: 'https://falabr.cgu.gov.br/web/home',
      officialSourceUrl:
        'https://www.gov.br/funai/pt-br/canais-de-atendimento/ouvidoria/defesa-usuarios',
    },
    lastReviewedAt: '2026-08-27',
  },
  {
    templateId: 'br.ibama.report',
    version: '1.0.0',
    country: 'BR',
    agency: 'IBAMA',
    agencyName:
      'Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis (Ibama)',
    outputLanguage: 'pt-BR',
    supportedCaseTypes: ALL_CASE_TYPES,
    requiredFacts: ['case.title', 'case.primaryType', 'incident.chronology'],
    optionalFacts: [
      'case.secondaryTypes',
      'case.context',
      'incident.date',
      'incident.dateRange',
      'impact.environmentalDamage',
      'impact.affectedResources',
      'incident.recurrence',
      'location.summary',
      'location.geometry',
      'evidence.summary',
      'action.requested',
    ],
    sections: [
      { id: 'identificacao', title: 'Identificação do relato', required: true },
      {
        id: 'localizacao',
        title: 'Localização e área afetada',
        required: false,
      },
      { id: 'cronologia', title: 'Cronologia dos fatos', required: true },
      { id: 'impactos', title: 'Danos e recursos afetados', required: false },
      { id: 'evidencias', title: 'Evidências disponíveis', required: false },
      {
        id: 'providencias',
        title: 'Providências solicitadas',
        required: false,
      },
    ],
    drafting: {
      instructions: [
        'Relate somente fatos presentes nos Case Facts fornecidos.',
        'Priorize dano ambiental documentado, localização aprovada, cronologia, recursos afetados e recorrência.',
        'Não conclua que houve crime, infração, intenção, autoria ou enquadramento legal.',
      ],
      standardWording: [],
      legalReferences: [],
      mayDiagnoseLegalViolation: false,
      mayConcludeOffense: false,
    },
    disclosureReviewPrompt: commonDisclosurePrompt,
    submission: {
      channel: 'fala-br',
      guidance: {
        en: 'IBAMA receives environmental complaints through Linha Verde, including the official electronic complaint form on Fala.BR.',
        pt: 'O Ibama recebe denúncias ambientais pelo Linha Verde, incluindo o formulário eletrônico oficial de denúncias no Fala.BR.',
        es: 'IBAMA recibe denuncias ambientales por Linha Verde, incluido el formulario electrónico oficial de denuncias en Fala.BR.',
      },
      verifyWarning,
      destinationUrl: 'https://falabr.cgu.gov.br/web/home',
      officialSourceUrl:
        'https://www.gov.br/ibama/pt-br/assuntos/fiscalizacao-e-protecao-ambiental/fiscalizacao-ambiental/denuncias',
    },
    lastReviewedAt: '2026-08-27',
  },
  {
    templateId: 'br.mpf.report',
    version: '1.0.0',
    country: 'BR',
    agency: 'MPF',
    agencyName: 'Ministério Público Federal (MPF)',
    outputLanguage: 'pt-BR',
    supportedCaseTypes: ALL_CASE_TYPES,
    requiredFacts: ['case.title', 'case.primaryType', 'incident.chronology'],
    optionalFacts: [
      'case.secondaryTypes',
      'case.context',
      'incident.date',
      'incident.dateRange',
      'people.communityContext',
      'impact.threats',
      'impact.environmentalDamage',
      'incident.recurrence',
      'actors.documented',
      'location.summary',
      'location.geometry',
      'evidence.summary',
      'action.requested',
    ],
    sections: [
      { id: 'identificacao', title: 'Identificação do relato', required: true },
      { id: 'contexto', title: 'Contexto e pessoas afetadas', required: false },
      { id: 'cronologia', title: 'Cronologia dos fatos', required: true },
      { id: 'impactos', title: 'Impactos documentados', required: false },
      {
        id: 'envolvidos',
        title: 'Pessoas ou partes documentadas',
        required: false,
      },
      { id: 'evidencias', title: 'Evidências disponíveis', required: false },
      {
        id: 'providencias',
        title: 'Providências solicitadas',
        required: false,
      },
    ],
    drafting: {
      instructions: [
        'Relate somente fatos presentes nos Case Facts fornecidos.',
        'Organize cronologia, impactos coletivos, indígenas ou ambientais, recorrência e partes documentadas sem inferir fatos ausentes.',
        'Não conclua que houve crime, infração, intenção, autoria, competência ou enquadramento legal.',
      ],
      standardWording: [],
      legalReferences: [],
      mayDiagnoseLegalViolation: false,
      mayConcludeOffense: false,
    },
    disclosureReviewPrompt: commonDisclosurePrompt,
    submission: {
      channel: 'mpf-servicos',
      guidance: {
        en: 'MPF Serviços accepts identified online representations after gov.br authentication; using that channel provides the reporter identity to the MPF. The MPF states that anonymous representations must be sent by post to the appropriate MPF unit.',
        pt: 'O MPF Serviços recebe representações identificadas pela internet após autenticação gov.br; nesse canal, a identidade da pessoa que envia é informada ao MPF. O MPF informa que representações anônimas devem ser encaminhadas por via postal à unidade competente.',
        es: 'MPF Serviços recibe representaciones identificadas por internet tras autenticación gov.br; ese canal proporciona al MPF la identidad de la persona remitente. El MPF informa que las representaciones anónimas deben enviarse por correo postal a la unidad competente.',
      },
      verifyWarning,
      destinationUrl:
        'https://www.mpf.mp.br/servicos/mpf-servicos-internas/denuncias',
      officialSourceUrl:
        'https://www.mpf.mp.br/servicos/mpf-servicos-internas/denuncias',
    },
    lastReviewedAt: '2026-08-27',
  },
  {
    templateId: 'br.pf.report',
    version: '1.0.0',
    country: 'BR',
    agency: 'PF',
    agencyName: 'Polícia Federal (PF)',
    outputLanguage: 'pt-BR',
    supportedCaseTypes: ALL_CASE_TYPES,
    requiredFacts: ['case.title', 'case.primaryType', 'incident.chronology'],
    optionalFacts: [
      'case.secondaryTypes',
      'case.context',
      'incident.date',
      'incident.dateRange',
      'incident.recurrence',
      'actors.documented',
      'equipment.documented',
      'location.summary',
      'location.geometry',
      'evidence.summary',
    ],
    sections: [
      {
        id: 'identificacao',
        title: 'Identificação da comunicação',
        required: true,
      },
      { id: 'fatos', title: 'Fatos e cronologia', required: true },
      { id: 'localizacao', title: 'Localização', required: false },
      { id: 'recorrencia', title: 'Recorrência ou padrão', required: false },
      {
        id: 'envolvidos',
        title: 'Atores, veículos ou equipamentos documentados',
        required: false,
      },
      { id: 'evidencias', title: 'Evidências disponíveis', required: false },
    ],
    drafting: {
      instructions: [
        'Relate somente fatos presentes nos Case Facts fornecidos.',
        'Descreva de modo conciso o que ocorreu, quando, onde, recorrência, atores, veículos, equipamentos e evidências apenas quando documentados.',
        'Não invente acusado, intenção, crime, competência, jurisdição ou enquadramento legal.',
      ],
      standardWording: [],
      legalReferences: [],
      mayDiagnoseLegalViolation: false,
      mayConcludeOffense: false,
    },
    disclosureReviewPrompt: commonDisclosurePrompt,
    submission: {
      channel: 'comunica-pf',
      guidance: {
        en: 'Comunica PF is for crimes within Federal Police investigative jurisdiction. Before sending, verify the current PF jurisdiction guidance; if it does not apply, use the appropriate local authority instead.',
        pt: 'O Comunica PF é destinado a crimes de atribuição investigativa da Polícia Federal. Antes de enviar, verifique as orientações atuais de atribuição da PF; se não se aplicarem, procure a autoridade local competente.',
        es: 'Comunica PF está destinado a delitos de atribución investigativa de la Policía Federal. Antes de enviar, verifique la orientación actual sobre atribuciones de la PF; si no corresponde, acuda a la autoridad local competente.',
      },
      verifyWarning,
      destinationUrl:
        'https://www.gov.br/pf/pt-br/canais_atendimento/comunicacao-de-crimes',
      officialSourceUrl:
        'https://www.gov.br/pf/pt-br/canais_atendimento/comunicacao-de-crimes',
    },
    lastReviewedAt: '2026-08-27',
  },
];

const parsedTemplates = v.parse(v.array(reportTemplateSchema), rawTemplates);

export const BRAZIL_REPORT_TEMPLATES: readonly ImmutableReportTemplate[] =
  deepFreeze(parsedTemplates);

export function getReportTemplate(
  agency: CaseAgency,
  version: string,
): ImmutableReportTemplate | undefined {
  return BRAZIL_REPORT_TEMPLATES.find(
    (template) => template.agency === agency && template.version === version,
  );
}

export function getLatestReportTemplate(
  agency: CaseAgency,
): ImmutableReportTemplate {
  const version = CURRENT_REPORT_TEMPLATE_VERSIONS[agency];
  const current =
    version === undefined ? undefined : getReportTemplate(agency, version);
  if (!current) {
    throw new Error(`No report template registered for agency ${agency}`);
  }
  return current;
}

export function resolveReportTemplate(
  reference: ReportTemplateReference,
): ImmutableReportTemplate {
  const parsed = v.parse(reportTemplateReferenceSchema, reference);
  const registered = getReportTemplate(parsed.agency, parsed.version);
  if (!registered || registered.templateId !== parsed.templateId) {
    throw new Error(
      `No registered report template matches ${parsed.templateId}@${parsed.version} for ${parsed.agency}`,
    );
  }
  return registered;
}

export interface SubmissionGuidanceStatus {
  stale: boolean;
  ageDays: number;
  officialSourceUrl: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getSubmissionGuidanceStatus(
  template: ImmutableReportTemplate,
  now = new Date(),
): SubmissionGuidanceStatus {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Invalid current date');
  }

  const [year, month, day] = template.lastReviewedAt.split('-').map(Number);
  const reviewedDay = Date.UTC(year!, month! - 1, day!);
  const currentDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (currentDay < reviewedDay) {
    throw new RangeError('Report template review date is in the future');
  }
  const ageDays = Math.floor((currentDay - reviewedDay) / DAY_MS);

  return {
    stale: ageDays > 180,
    ageDays,
    officialSourceUrl: template.submission.officialSourceUrl,
  };
}

export const REPORT_TEMPLATE_LOCALES = LOCALES;
