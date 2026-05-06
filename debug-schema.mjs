import Dexie from 'dexie';

const db = new Dexie('test-schema');
db.version(1).stores({
  projects: '&localId',
});

const out = await db.open();
const table = db.tables[0];
console.log('primKey:', JSON.stringify(table.schema.primKey, null, 2));
console.log('primKey keys:', Object.keys(table.schema.primKey));
console.log('all schema keys:', Object.keys(table.schema));
await db.close();