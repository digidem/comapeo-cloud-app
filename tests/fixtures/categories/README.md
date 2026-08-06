# Default Category Fixtures

Representative fixtures vendored from
[digidem/comapeo-default-categories](https://github.com/digidem/comapeo-default-categories).

**Upstream version**: v1.1.2
**Upstream commit**: `35fbc145e172dba8dc3e2af5e0598a753f36cae0` (2026-06-29)
**Vendored date**: 2026-07-22

## What's included

5 representative category JSON files chosen to cover a range of field
references, tag structures, and geometry types:

- `animal.json` — nature category with select fields
- `plant.json` — nature category with minimal fields
- `body-of-water.json` — nature category with many field refs
- `community.json` — infrastructure category
- `cultural-site.json` — culture category with selectMultiple fields

Plus `metadata.json` from the upstream package root.

These are NOT all upstream categories — they are a representative subset for
schema validation testing.

## Source format

Each category JSON follows the upstream `.comapeocat` import format:

```json
{
  "name": "Animal",
  "icon": "animal",
  "color": "#9E2C54",
  "fields": ["name", "animal-type"],
  "appliesTo": ["observation"],
  "tags": { "type": "nature", "nature": "wildlife", "wildlife": "animal" }
}
```

Field JSON follows:

```json
{
  "tagKey": "animal-type",
  "type": "selectOne",
  "label": "Animal type",
  "helperText": "What kind of animal?",
  "options": [{ "label": "Mammal", "value": "mammal" }]
}
```

## Updating

When upstream releases a new version, update the files in this directory and
bump the version/commit above.
