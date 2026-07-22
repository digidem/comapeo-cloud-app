import animalCategory from './animal.json';
import bodyOfWaterCategory from './body-of-water.json';
import communityCategory from './community.json';
import culturalSiteCategory from './cultural-site.json';
import plantCategory from './plant.json';
import metadata from './metadata.json';

import accessField from './access.json';
import animalTypeField from './animal-type.json';
import bodyOfWaterTypeField from './body-of-water-type.json';
import conditionsField from './conditions.json';
import culturalCategoryField from './cultural-category.json';
import culturalDetailsField from './cultural-details.json';
import culturalNameField from './cultural-name.json';
import ecologicalStatusField from './ecological-status.json';
import nameField from './name.json';
import naturalResourceTypeField from './natural-resource-type.json';

export type CategoryFixture = {
  name: string;
  icon: string;
  color: string;
  fields: string[];
  appliesTo: string[];
  tags: Record<string, string>;
};

export type FieldFixture = {
  tagKey: string;
  type: string;
  label: string;
  helperText?: string;
  options?: Array<{ label: string; value: string }>;
};

export type MetadataFixture = {
  name: string;
  [key: string]: unknown;
};

export type CategoryFixtures = {
  metadata: MetadataFixture;
  categories: Record<string, CategoryFixture>;
  fields: Record<string, FieldFixture>;
};

export function loadDefaultCategoryFixtures(): CategoryFixtures {
  return {
    metadata: metadata as MetadataFixture,
    categories: {
      animal: animalCategory as CategoryFixture,
      plant: plantCategory as CategoryFixture,
      'body-of-water': bodyOfWaterCategory as CategoryFixture,
      community: communityCategory as CategoryFixture,
      'cultural-site': culturalSiteCategory as CategoryFixture,
    },
    fields: {
      name: nameField as FieldFixture,
      'animal-type': animalTypeField as FieldFixture,
      'body-of-water-type': bodyOfWaterTypeField as FieldFixture,
      conditions: conditionsField as FieldFixture,
      'cultural-category': culturalCategoryField as FieldFixture,
      'cultural-details': culturalDetailsField as FieldFixture,
      'cultural-name': culturalNameField as FieldFixture,
      'ecological-status': ecologicalStatusField as FieldFixture,
      'natural-resource-type': naturalResourceTypeField as FieldFixture,
      access: accessField as FieldFixture,
    },
  };
}
