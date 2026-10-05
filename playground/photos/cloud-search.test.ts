import { test, expect } from 'bun:test';
import { createPhotoSearchRequest, parsePhotoSearchResults } from './cloud-search';

test('name query is preserved for remote matching', () => {
  expect(createPhotoSearchRequest(' Example ', 123).photos.search).toEqual({string:'Example',assetsLimit:5001,collectionsLimit:2001,clientTimestamp:123});
  expect(createPhotoSearchRequest('Sample Chan',123).photos.search.string).toBe('Sample Chan');
  expect(() => createPhotoSearchRequest(' ')).toThrow('invalid_search_payload');
});
test('mixed result types remain distinguishable from assets', () => {
  const parsed = parsePhotoSearchResults({results:['legacy',{id:'asset',type:'1'},{id:'album',type:'2'},{id:'future',type:'99'}],totalAssetCount:20,totalCollectionCount:1});
  expect(parsed.results.map(v=>v.type)).toEqual(['1','1','2','99']);
  expect(parsed.totalAssetCount).toBe(20);
  expect(parsed.recommendedResults).toEqual([]);
});
test('malformed chunks cannot become successful empty searches', () => {
  for (const value of [null,{}, {results:[],totalAssetCount:-1,totalCollectionCount:0}, {results:[{id:'x'}],totalAssetCount:1,totalCollectionCount:0}]) {
    expect(() => parsePhotoSearchResults(value)).toThrow('invalid_search_payload');
  }
});
