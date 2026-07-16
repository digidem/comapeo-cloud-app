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
    defaultMessage: 'Latitude must be between -90 and 90',
  },
  invalidLngOrder: {
    id: 'map.bounds.invalidLngOrder',
    defaultMessage: 'East must be greater than west',
  },
  invalidLatOrder: {
    id: 'map.bounds.invalidLatOrder',
    defaultMessage: 'North must be greater than south',
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
  downloadEstimatedSize: {
    id: 'map.download.estimatedSize',
    defaultMessage: 'Estimated size: {size}',
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
});
