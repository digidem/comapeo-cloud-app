import { defineMessages } from 'react-intl';

export const mapMessages = defineMessages({
  title: {
    id: 'map.title',
    defaultMessage: 'Map',
  },
  untitledProject: {
    id: 'map.saved.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  noProject: {
    id: 'map.saved.noProject',
    defaultMessage: 'Select a project from Home to author maps',
  },
  noProjectLink: {
    id: 'map.saved.noProjectLink',
    defaultMessage: 'Go to Home',
  },
  canvasAria: {
    id: 'map.saved.canvasAria',
    defaultMessage: 'Map authoring canvas',
  },
  settings: {
    id: 'map.saved.settings',
    defaultMessage: 'Map settings',
  },
  closeSettings: {
    id: 'map.saved.closeSettings',
    defaultMessage: 'Close map settings',
  },
  saveMap: {
    id: 'map.saved.saveMap',
    defaultMessage: 'Save Map',
  },
  savedMaps: {
    id: 'map.saved.title',
    defaultMessage: 'Saved maps',
  },
  savedMapsEmpty: {
    id: 'map.saved.empty',
    defaultMessage: 'No saved maps yet',
  },
  savedMapsScopeLabel: {
    id: 'map.saved.scope.label',
    defaultMessage: 'Saved maps scope',
  },
  savedMapsThisProject: {
    id: 'map.saved.scope.thisProject',
    defaultMessage: 'This project',
  },
  savedMapsAllProjects: {
    id: 'map.saved.scope.allProjects',
    defaultMessage: 'All projects',
  },
  savedMapOrigin: {
    id: 'map.saved.origin',
    defaultMessage: 'Origin: {project}',
  },
  savedMapOriginUnavailable: {
    id: 'map.saved.originUnavailable',
    defaultMessage: 'Origin project unavailable',
  },
  statusDraft: {
    id: 'map.saved.statusDraft',
    defaultMessage: 'Draft',
  },
  statusDownloading: {
    id: 'map.saved.statusDownloading',
    defaultMessage: 'Downloading',
  },
  statusReady: {
    id: 'map.saved.statusReady',
    defaultMessage: 'Ready',
  },
  statusError: {
    id: 'map.saved.statusError',
    defaultMessage: 'Error',
  },
  setActive: {
    id: 'map.saved.setActive',
    defaultMessage: 'Set active',
  },
  removeActive: {
    id: 'map.saved.removeActive',
    defaultMessage: 'Remove active',
  },
  previewAction: {
    id: 'map.preview.action',
    defaultMessage: 'Preview',
  },
  previewTitle: {
    id: 'map.preview.title',
    defaultMessage: 'Preview map',
  },
  previewClose: {
    id: 'map.preview.close',
    defaultMessage: 'Close',
  },
  previewLoading: {
    id: 'map.preview.loading',
    defaultMessage: 'Loading map preview…',
  },
  previewError: {
    id: 'map.preview.error',
    defaultMessage: 'Could not preview this SMP.',
  },
  importButton: {
    id: 'map.import.button',
    defaultMessage: 'Import SMP',
  },
  importFileLabel: {
    id: 'map.import.fileLabel',
    defaultMessage: 'Import SMP file',
  },
  importOfflineOnly: {
    id: 'map.import.offlineOnly',
    defaultMessage:
      'This SMP contains map resources that are not packaged for offline use',
  },
  importInvalidFile: {
    id: 'map.import.invalidFile',
    defaultMessage: 'This file is not a valid SMP',
  },
  importMissingStyle: {
    id: 'map.import.missingStyle',
    defaultMessage: 'SMP has no map style',
  },
  importSuccess: {
    id: 'map.import.success',
    defaultMessage: 'SMP imported successfully',
  },
  importQuotaExceeded: {
    id: 'map.import.quotaExceeded',
    defaultMessage: 'Not enough storage space to import this SMP',
  },
  importSaveError: {
    id: 'map.import.saveError',
    defaultMessage: 'Could not import this SMP. Please try again.',
  },
  rename: {
    id: 'map.saved.rename',
    defaultMessage: 'Rename',
  },
  renamePrompt: {
    id: 'map.saved.renamePrompt',
    defaultMessage: 'Map name',
  },
  renameDialogTitle: {
    id: 'map.saved.renameDialog.title',
    defaultMessage: 'Rename map',
  },
  renameDialogDescription: {
    id: 'map.saved.renameDialog.description',
    defaultMessage: 'Enter a new name for this saved map.',
  },
  renameSave: {
    id: 'map.saved.renameDialog.save',
    defaultMessage: 'Save name',
  },
  delete: {
    id: 'map.saved.delete',
    defaultMessage: 'Delete',
  },
  activeError: {
    id: 'map.saved.activeError',
    defaultMessage: 'Could not update active map. Please try again.',
  },
  deleteDialogTitle: {
    id: 'map.saved.deleteDialog.title',
    defaultMessage: 'Delete map',
  },
  deleteDialogDescription: {
    id: 'map.saved.deleteDialog.description',
    defaultMessage:
      'Are you sure you want to delete “{name}”? This action cannot be undone.',
  },
  deleteConfirm: {
    id: 'map.saved.deleteDialog.confirm',
    defaultMessage: 'Delete map',
  },
  deleteError: {
    id: 'map.saved.deleteDialog.error',
    defaultMessage: 'Could not delete map. Please try again.',
  },
  stylePickerTitle: {
    id: 'map.stylePicker.title',
    defaultMessage: 'Base map',
  },
  presetsMode: {
    id: 'map.stylePicker.presetsMode',
    defaultMessage: 'Presets',
  },
  customMode: {
    id: 'map.stylePicker.customMode',
    defaultMessage: 'Custom URL',
  },
  customUrlLabel: {
    id: 'map.stylePicker.customUrlLabel',
    defaultMessage: 'Custom URL',
  },
  customUrlPlaceholder: {
    id: 'map.stylePicker.customUrlPlaceholder',
    defaultMessage: 'https://tiles.example.com/{z}/{x}/{y}.png',
  },
  mapTypeLabel: {
    id: 'map.stylePicker.mapTypeLabel',
    defaultMessage: 'Map type',
  },
  typeRaster: {
    id: 'map.stylePicker.typeRaster',
    defaultMessage: 'Raster tiles',
  },
  typeStyle: {
    id: 'map.stylePicker.typeStyle',
    defaultMessage: 'Style JSON',
  },
  schemeLabel: {
    id: 'map.stylePicker.schemeLabel',
    defaultMessage: 'Tile scheme',
  },
  schemeXyz: {
    id: 'map.stylePicker.schemeXyz',
    defaultMessage: 'XYZ',
  },
  schemeTms: {
    id: 'map.stylePicker.schemeTms',
    defaultMessage: 'TMS',
  },
  useCustomUrl: {
    id: 'map.stylePicker.useCustomUrl',
    defaultMessage: 'Use custom URL',
  },
  invalidUrl: {
    id: 'map.stylePicker.invalidUrl',
    defaultMessage: 'Enter an http:// or https:// URL',
  },
  customUrlHostnameWarning: {
    id: 'map.stylePicker.customUrlHostnameWarning',
    defaultMessage:
      'This tile provider may not be available for offline downloads. Only supported providers work with map package generation.',
  },
  selectedStyle: {
    id: 'map.stylePicker.selectedStyle',
    defaultMessage: 'Selected',
  },
  boundsTitle: {
    id: 'map.bounds.title',
    defaultMessage: 'Bounds',
  },
  west: {
    id: 'map.bounds.west',
    defaultMessage: 'West',
  },
  south: {
    id: 'map.bounds.south',
    defaultMessage: 'South',
  },
  east: {
    id: 'map.bounds.east',
    defaultMessage: 'East',
  },
  north: {
    id: 'map.bounds.north',
    defaultMessage: 'North',
  },
  useCurrentView: {
    id: 'map.bounds.useCurrentView',
    defaultMessage: 'Use current view',
  },
  useProjectArea: {
    id: 'map.bounds.useProjectArea',
    defaultMessage: 'Use project area',
  },
  noProjectPoints: {
    id: 'map.bounds.noProjectPoints',
    defaultMessage: 'No observations with coordinates in this project yet',
  },
  invalidLongitude: {
    id: 'map.bounds.invalidLongitude',
    defaultMessage: 'Longitude must be between -180 and 180',
  },
  invalidLatitude: {
    id: 'map.bounds.invalidLatitude',
    defaultMessage: 'Latitude must be between -85.0511 and 85.0511',
  },
  invalidLngOrder: {
    id: 'map.bounds.invalidLngOrder',
    defaultMessage: 'East must be greater than west',
  },
  invalidLatOrder: {
    id: 'map.bounds.invalidLatOrder',
    defaultMessage: 'North must be greater than south',
  },
  zeroAreaBounds: {
    id: 'map.bounds.zeroAreaBounds',
    defaultMessage: 'Selected area has no size. Add more observations first.',
  },
  antimeridianCrossing: {
    id: 'map.bounds.antimeridianCrossing',
    defaultMessage: 'Selection cannot cross the 180° meridian.',
  },
  invalidCoordinates: {
    id: 'map.bounds.invalidCoordinates',
    defaultMessage: 'Coordinates must be valid numbers',
  },
  zoomTitle: {
    id: 'map.zoom.title',
    defaultMessage: 'Zoom range',
  },
  minZoom: {
    id: 'map.zoom.minZoom',
    defaultMessage: 'Minimum zoom',
  },
  maxZoom: {
    id: 'map.zoom.maxZoom',
    defaultMessage: 'Maximum zoom',
  },
  invalidZoom: {
    id: 'map.zoom.invalidZoom',
    defaultMessage: 'Zoom must be between 0 and 22',
  },
  invalidZoomRange: {
    id: 'map.zoom.invalidRange',
    defaultMessage: 'Max zoom must be greater than or equal to min zoom',
  },
  zoomDownloadNote: {
    id: 'map.zoom.downloadNote',
    defaultMessage: 'Downloads include all zoom levels from 0 to the maximum.',
  },
  nameDialogTitle: {
    id: 'map.nameDialog.title',
    defaultMessage: 'Save map',
  },
  nameDialogDescription: {
    id: 'map.nameDialog.description',
    defaultMessage:
      'Save this map configuration as a draft. You can then download it as an .smp file.',
  },
  nameLabel: {
    id: 'map.nameDialog.nameLabel',
    defaultMessage: 'Map name',
  },
  namePlaceholder: {
    id: 'map.nameDialog.namePlaceholder',
    defaultMessage: 'Territory basemap',
  },
  nameRequired: {
    id: 'map.nameDialog.nameRequired',
    defaultMessage: 'Enter a map name',
  },
  saveError: {
    id: 'map.nameDialog.saveError',
    defaultMessage: 'Could not save map. Please try again.',
  },
  cancel: {
    id: 'map.nameDialog.cancel',
    defaultMessage: 'Cancel',
  },
  saveDraft: {
    id: 'map.nameDialog.saveDraft',
    defaultMessage: 'Save draft',
  },
  // ── Download ───────────────────────────────────────────────────────────
  downloadButton: {
    id: 'map.download.button',
    defaultMessage: 'Download Map',
  },
  downloadProgress: {
    id: 'map.download.progress',
    defaultMessage: 'Downloading… {downloaded} of {total} tiles ({bytes})',
  },
  downloadStarting: {
    id: 'map.download.starting',
    defaultMessage: 'Starting download…',
  },
  downloadFailed: {
    id: 'map.download.error',
    defaultMessage: 'Download failed: {error}',
  },
  downloadCancel: {
    id: 'map.download.cancel',
    defaultMessage: 'Cancel',
  },
  downloadConfirmLarge: {
    id: 'map.download.confirmLarge',
    defaultMessage:
      'This map is estimated at {size}. It may take a while. Continue?',
  },
  downloadStorageWarning: {
    id: 'map.download.storageWarning',
    defaultMessage:
      'Not enough storage space. {available} available, {estimated} estimated.',
  },
  downloadConcurrencyWarning: {
    id: 'map.download.concurrencyWarning',
    defaultMessage:
      'Another map is currently downloading. Please wait for it to finish before starting a new download.',
  },
  downloadEstimatedSize: {
    id: 'map.download.estimatedSize',
    defaultMessage: 'Estimated size: {size}',
  },
  downloadGlobalOverview: {
    id: 'map.download.globalOverview',
    defaultMessage: 'Global overview',
  },
  downloadGlobalOverviewDescription: {
    id: 'map.download.globalOverviewDescription',
    defaultMessage: 'Include worldwide context at zoom levels 0–3.',
  },
  downloadRetry: {
    id: 'map.download.retry',
    defaultMessage: 'Retry',
  },
  downloadMaxRetries: {
    id: 'map.download.maxRetries',
    defaultMessage: 'Max retries reached',
  },
  downloadTryAnyway: {
    id: 'map.download.tryAnyway',
    defaultMessage: 'Try anyway',
  },
  downloadReady: {
    id: 'map.download.ready',
    defaultMessage: 'Map downloaded successfully ({size})',
  },
  downloadImportedReady: {
    id: 'map.download.importedReady',
    defaultMessage: 'Imported map package is ready ({size})',
  },
  downloadExport: {
    id: 'map.download.export',
    defaultMessage: 'Download SMP File',
  },
  drawBounds: {
    id: 'map.bounds.drawBounds',
    defaultMessage: 'Draw bounds',
  },
  cancelDraw: {
    id: 'map.bounds.cancelDraw',
    defaultMessage: 'Cancel drawing',
  },
  drawingInstruction: {
    id: 'map.bounds.drawingInstruction',
    defaultMessage: 'Drag on the map to set the area',
  },
  drawingInstructionCancel: {
    id: 'map.bounds.drawingInstructionCancel',
    defaultMessage: 'Cancel',
  },
  setThisArea: {
    id: 'map.bounds.setThisArea',
    defaultMessage: 'Set this area',
  },
  areaUpdated: {
    id: 'map.bounds.areaUpdated',
    defaultMessage: 'Map area updated',
  },
  undo: {
    id: 'map.bounds.undo',
    defaultMessage: 'Undo',
  },
  frameInstruction: {
    id: 'map.bounds.frameInstruction',
    defaultMessage: 'Pan and zoom until the area fits inside the frame',
  },
  downloadInterrupted: {
    id: 'map.download.interrupted',
    defaultMessage: 'A previous download was interrupted. You can try again.',
  },
  downloadMissing: {
    id: 'map.download.missing',
    defaultMessage:
      'The saved map package is missing or unreadable. You can regenerate it.',
  },
  downloadMissingImported: {
    id: 'map.download.missingImported',
    defaultMessage:
      'The imported map package is missing or unreadable. Import the original SMP file again.',
  },
  downloadUnknownError: {
    id: 'map.download.unknownError',
    defaultMessage: 'Unknown error',
  },
  downloadSkippedWarning: {
    id: 'map.download.skippedWarning',
    defaultMessage:
      '{n} tiles could not be downloaded. The package may be incomplete.',
  },
  referenceOverlaysTitle: {
    id: 'map.referenceOverlays.title',
    defaultMessage: 'Reference data',
  },
  referenceOverlaysHelp: {
    id: 'map.referenceOverlays.help',
    defaultMessage:
      'Add GeoJSON to align the download area. Reference data is not saved with the map.',
  },
  referenceOverlaysAdd: {
    id: 'map.referenceOverlays.add',
    defaultMessage: 'Add GeoJSON reference',
  },
  referenceOverlaysLoading: {
    id: 'map.referenceOverlays.loading',
    defaultMessage: 'Adding GeoJSON…',
  },
  referenceOverlaysSizeLimit: {
    id: 'map.referenceOverlays.sizeLimit',
    defaultMessage: 'Up to 5 MB per file',
  },
  referenceOverlaysList: {
    id: 'map.referenceOverlays.list',
    defaultMessage: 'GeoJSON reference files',
  },
  referenceOverlaysHide: {
    id: 'map.referenceOverlays.hide',
    defaultMessage: 'Hide {name}',
  },
  referenceOverlaysShow: {
    id: 'map.referenceOverlays.show',
    defaultMessage: 'Show {name}',
  },
  referenceOverlaysVisible: {
    id: 'map.referenceOverlays.visible',
    defaultMessage: 'Visible',
  },
  referenceOverlaysHidden: {
    id: 'map.referenceOverlays.hidden',
    defaultMessage: 'Hidden',
  },
  referenceOverlaysRemove: {
    id: 'map.referenceOverlays.remove',
    defaultMessage: 'Remove {name}',
  },
  referenceOverlaysRemoveAction: {
    id: 'map.referenceOverlays.removeAction',
    defaultMessage: 'Remove',
  },
  referenceOverlaysDropHint: {
    id: 'map.referenceOverlays.dropHint',
    defaultMessage: 'Drop GeoJSON files to add reference data',
  },
  referenceOverlaysDismiss: {
    id: 'map.referenceOverlays.dismiss',
    defaultMessage: 'Dismiss error',
  },
  referenceOverlaysDismissAction: {
    id: 'map.referenceOverlays.dismissAction',
    defaultMessage: 'Dismiss',
  },
  referenceOverlaysInvalid: {
    id: 'map.referenceOverlays.invalid',
    defaultMessage: '{name} is not valid GeoJSON.',
  },
  referenceOverlaysTooLarge: {
    id: 'map.referenceOverlays.tooLarge',
    defaultMessage: '{name} is larger than 5 MB. Choose a smaller file.',
  },
  referenceOverlaysUnsupported: {
    id: 'map.referenceOverlays.unsupported',
    defaultMessage: '{name} has no supported geometry to display.',
  },
  referenceOverlaysUnsupportedFile: {
    id: 'map.referenceOverlays.unsupportedFile',
    defaultMessage: '{name} is not a GeoJSON or JSON file.',
  },
  referenceOverlaysReadError: {
    id: 'map.referenceOverlays.readError',
    defaultMessage: 'Could not read {name}.',
  },
});
