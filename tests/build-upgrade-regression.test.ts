import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldUpgradeClientBuild} from '../src/utils/buildUpgrade';

test('running old Vercel JS detects newer production SHA on first version poll',()=>{
 assert.equal(shouldUpgradeClientBuild('old-build',null,'new-build'),true);
 assert.equal(shouldUpgradeClientBuild('current-build',null,'current-build'),false);
});
test('durable rejected accounting outbox never blocks updating an idle browser JS bundle',()=>{
 assert.equal(shouldUpgradeClientBuild('old-build','old-build','new-build'),true);
});
test('local dev without embedded SHA establishes a baseline before noticing deployment changes',()=>{
 assert.equal(shouldUpgradeClientBuild('',null,'build-1'),false);
 assert.equal(shouldUpgradeClientBuild('','build-1','build-2'),true);
 assert.equal(shouldUpgradeClientBuild('','build-1','build-1'),false);
 assert.equal(shouldUpgradeClientBuild('',null,''),false);
});
