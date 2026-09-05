import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { updateProject } from '@/lib/data-layer';
import type {
  Project,
  ReportBrandingLogoAsset,
  ReportBrandingLogoContentType,
} from '@/lib/db';
import {
  REPORT_BRANDING_LOGO_MAX_BYTES,
  ReportBrandingValidationError,
  createReportBrandingLogoAsset,
  normalizeOrganizationName,
  resolveProjectReportBranding,
} from '@/lib/reports/report-branding';

interface ReportBrandingDialogProps {
  isOpen: boolean;
  project: Project;
  onClose: () => void;
  onSaved: (project: Project) => void | Promise<void>;
}

interface ReportBrandingFormData {
  organizationName: string;
}

const ALLOWED_LOGO_CONTENT_TYPES = new Set<ReportBrandingLogoContentType>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function isAllowedLogoContentType(
  contentType: string,
): contentType is ReportBrandingLogoContentType {
  return ALLOWED_LOGO_CONTENT_TYPES.has(
    contentType as ReportBrandingLogoContentType,
  );
}

async function readImageDimensions(
  file: Blob,
): Promise<{ width: number; height: number }> {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read logo image'));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('Unable to read logo image'));
    reader.readAsDataURL(file);
  });

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      reject(new Error('Unable to decode logo image'));
    };
    image.src = dataUrl;
  });
}

const messages = defineMessages({
  title: {
    id: 'home.reportBranding.title',
    defaultMessage: 'Report branding',
  },
  description: {
    id: 'home.reportBranding.description',
    defaultMessage:
      'Set the issuing organization shown on reports. This is separate from the project icon.',
  },
  organizationName: {
    id: 'home.reportBranding.organizationName',
    defaultMessage: 'Organization name',
  },
  organizationNamePlaceholder: {
    id: 'home.reportBranding.organizationNamePlaceholder',
    defaultMessage: 'Enter organization name',
  },
  organizationNameRequired: {
    id: 'home.reportBranding.organizationNameRequired',
    defaultMessage: 'Organization name is required',
  },
  logo: {
    id: 'home.reportBranding.logo',
    defaultMessage: 'Organization logo',
  },
  logoConfigured: {
    id: 'home.reportBranding.logoConfigured',
    defaultMessage: 'Report logo configured',
  },
  noLogo: {
    id: 'home.reportBranding.noLogo',
    defaultMessage: 'No report logo configured',
  },
  removeLogo: {
    id: 'home.reportBranding.removeLogo',
    defaultMessage: 'Remove logo',
  },
  uploadLogo: {
    id: 'home.reportBranding.uploadLogo',
    defaultMessage: 'Upload logo',
  },
  replaceLogo: {
    id: 'home.reportBranding.replaceLogo',
    defaultMessage: 'Replace logo',
  },
  logoRequirements: {
    id: 'home.reportBranding.logoRequirements',
    defaultMessage: 'PNG, JPEG, or WebP. Maximum 2 MB and 2048×2048 pixels.',
  },
  logoTypeUnsupported: {
    id: 'home.reportBranding.logoTypeUnsupported',
    defaultMessage: 'Logo must be PNG, JPEG, or WebP',
  },
  logoTooLarge: {
    id: 'home.reportBranding.logoTooLarge',
    defaultMessage: 'Logo must be 2 MB or smaller',
  },
  logoDimensionsInvalid: {
    id: 'home.reportBranding.logoDimensionsInvalid',
    defaultMessage: 'Logo dimensions must be valid whole pixels',
  },
  logoDimensionsTooLarge: {
    id: 'home.reportBranding.logoDimensionsTooLarge',
    defaultMessage: 'Logo dimensions must not exceed 2048×2048 pixels',
  },
  logoMimeMismatch: {
    id: 'home.reportBranding.logoMimeMismatch',
    defaultMessage: 'The selected file type does not match the image content',
  },
  logoProcessingFailed: {
    id: 'home.reportBranding.logoProcessingFailed',
    defaultMessage: 'Unable to process logo image',
  },
  cancel: {
    id: 'home.reportBranding.cancel',
    defaultMessage: 'Cancel',
  },
  save: {
    id: 'home.reportBranding.save',
    defaultMessage: 'Save branding',
  },
  saveFailed: {
    id: 'home.reportBranding.saveFailed',
    defaultMessage: 'Failed to save report branding',
  },
});

export function ReportBrandingDialog({
  isOpen,
  project,
  onClose,
  onSaved,
}: ReportBrandingDialogProps) {
  const intl = useIntl();
  const current = resolveProjectReportBranding(project);
  const formSchema = useMemo(
    () =>
      v.object({
        organizationName: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1, intl.formatMessage(messages.organizationNameRequired)),
        ),
      }),
    [intl],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportBrandingFormData>({
    resolver: valibotResolver(formSchema),
    defaultValues: { organizationName: current.organizationName },
  });
  const [logo, setLogo] = useState<ReportBrandingLogoAsset | undefined>(
    current.logo,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
  }

  function logoValidationMessage(error: ReportBrandingValidationError): string {
    switch (error.code) {
      case 'logo-type-unsupported':
        return intl.formatMessage(messages.logoTypeUnsupported);
      case 'logo-too-large':
        return intl.formatMessage(messages.logoTooLarge);
      case 'logo-dimensions-invalid':
        return intl.formatMessage(messages.logoDimensionsInvalid);
      case 'logo-dimensions-too-large':
        return intl.formatMessage(messages.logoDimensionsTooLarge);
      case 'logo-mime-mismatch':
        return intl.formatMessage(messages.logoMimeMismatch);
      default:
        return intl.formatMessage(messages.logoProcessingFailed);
    }
  }

  async function handleLogoFile(file: File) {
    setError(null);
    if (!isAllowedLogoContentType(file.type)) {
      setError(intl.formatMessage(messages.logoTypeUnsupported));
      return;
    }
    if (file.size > REPORT_BRANDING_LOGO_MAX_BYTES) {
      setError(intl.formatMessage(messages.logoTooLarge));
      return;
    }

    setIsProcessingLogo(true);
    try {
      const [{ width, height }, data] = await Promise.all([
        readImageDimensions(file),
        file.arrayBuffer(),
      ]);
      const nextLogo = await createReportBrandingLogoAsset({
        data,
        contentType: file.type,
        width,
        height,
        versionId: globalThis.crypto.randomUUID(),
      });
      setLogo(nextLogo);
    } catch (logoError) {
      setError(
        logoError instanceof ReportBrandingValidationError
          ? logoValidationMessage(logoError)
          : intl.formatMessage(messages.logoProcessingFailed),
      );
    } finally {
      setIsProcessingLogo(false);
    }
  }

  async function handleSave(data: ReportBrandingFormData) {
    const normalizedName = normalizeOrganizationName(data.organizationName);
    setIsSaving(true);
    setError(null);
    try {
      const savedProject = await updateProject(project.localId, {
        reportBranding: {
          schemaVersion: 1,
          organizationName: normalizedName,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
          logo,
        },
      });
      if (!savedProject) {
        throw new Error('Project not found after report branding save');
      }
      await onSaved(savedProject);
    } catch {
      setError(intl.formatMessage(messages.saveFailed));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title={intl.formatMessage(messages.title)}
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit((data) => void handleSave(data))}
      >
        <p className="text-sm text-text-muted">
          {intl.formatMessage(messages.description)}
        </p>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="report-branding-organization-name"
            className="text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.organizationName)}
          </label>
          <input
            id="report-branding-organization-name"
            {...register('organizationName')}
            aria-invalid={errors.organizationName ? 'true' : undefined}
            aria-describedby={
              errors.organizationName
                ? 'report-branding-organization-name-error'
                : undefined
            }
            placeholder={intl.formatMessage(
              messages.organizationNamePlaceholder,
            )}
            className="w-full rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
          />
          {errors.organizationName?.message && (
            <p
              id="report-branding-organization-name-error"
              role="alert"
              className="text-sm text-error"
            >
              {errors.organizationName.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">
            {intl.formatMessage(messages.logo)}
          </span>
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-card bg-surface-muted px-3 py-3">
            <span className="text-sm text-text-muted">
              {intl.formatMessage(
                logo ? messages.logoConfigured : messages.noLogo,
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor="report-branding-logo-upload"
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-btn border border-border bg-white px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
              >
                {intl.formatMessage(
                  logo ? messages.replaceLogo : messages.uploadLogo,
                )}
                <input
                  id="report-branding-logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={isProcessingLogo || isSaving}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleLogoFile(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {logo && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setLogo(undefined)}
                  disabled={isProcessingLogo || isSaving}
                >
                  {intl.formatMessage(messages.removeLogo)}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-text-muted">
            {intl.formatMessage(messages.logoRequirements)}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
          >
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={isSaving}
            disabled={isProcessingLogo}
          >
            {intl.formatMessage(messages.save)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export type { ReportBrandingDialogProps };
