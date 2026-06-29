import { FormattedMessage } from 'react-intl';

export function MapScreen() {
  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text">
        <FormattedMessage id="map.title" defaultMessage="Map" />
      </h1>
    </div>
  );
}
