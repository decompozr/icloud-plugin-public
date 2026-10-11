import {test,expect} from 'bun:test';
import {parseReaderSetupOptions} from './setup-reader-options.js';
import {LocalPhotosProvider,runReader} from './provider.js';
test('reader setup requires explicit existing dependencies, selected library and stable identity',()=>{
 const args=['/private/new','--python','/private/python','--library','/private/Library.photoslibrary','--sign','Developer Identity'];
 expect(parseReaderSetupOptions(args)).toEqual({directory:'/private/new',python:'/private/python',library:'/private/Library.photoslibrary',sign:'Developer Identity'});
 expect(()=>parseReaderSetupOptions(args.slice(0,-2))).toThrow('Stable signing identity');
 expect(()=>parseReaderSetupOptions([...args.slice(0,-1),'-'])).toThrow('Stable signing identity');
 expect(()=>parseReaderSetupOptions([...args,'--python','/other'])).toThrow('Invalid reader setup option');
 expect(()=>parseReaderSetupOptions(['relative',...args.slice(1)])).toThrow('Absolute new reader');
});
test('reader cannot execute writes or unbundled binaries before any launch',async()=>{
 await expect(runReader('/never/Photos.app/Contents/MacOS/photos-reader',{command:'apply',library:'/private/Library.photoslibrary'})).rejects.toThrow('invalid_reader_request');
 await expect(runReader('/never/python',{command:'access',library:'/private/Library.photoslibrary'})).rejects.toThrow('packaged_helper_required');
 const provider=new LocalPhotosProvider({python:'/never/python',library:'/private/Library.photoslibrary',nativeHelper:'/never/helper'});
 await expect(provider.read('health',{})).rejects.toThrow('photos_reader_setup_required');
});
