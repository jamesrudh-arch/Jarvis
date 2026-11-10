/**
 * Automated Verification Suite for 3D Rigged Character Assets, Viseme Engine,
 * Mixamo Locomotion Clips, and Preview Proxy Hygiene.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LipsyncEn } from '../src/vendor/lipsync-en.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

function parseGlbJson(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', `Invalid GLB magic in ${filePath}`);
  const chunkLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + chunkLen);
  return JSON.parse(jsonStr);
}

// 1. Verify licensed rigged adult female JARVIS model (jarvis_avaturn.glb)
const jarvisGlbPath = path.join(frontendRoot, 'public/models/jarvis_avaturn.glb');
assert.ok(fs.existsSync(jarvisGlbPath), 'jarvis_avaturn.glb must exist');
const jarvisGltf = parseGlbJson(jarvisGlbPath);

const nodeNames = new Set((jarvisGltf.nodes || []).map((n) => n.name).filter(Boolean));
for (const requiredBone of [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftEye', 'RightEye', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
]) {
  assert.ok(nodeNames.has(requiredBone), `Missing required skeletal bone: ${requiredBone}`);
}

const headMesh = (jarvisGltf.meshes || []).find((m) => m.name === 'Head_Mesh');
assert.ok(headMesh, 'Head_Mesh must exist');
const morphTargets = new Set(
  headMesh.extras?.targetNames || headMesh.primitives?.[0]?.extras?.targetNames || []
);
for (const viseme of [
  'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD',
  'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
  'eyeBlinkLeft', 'eyeBlinkRight', 'browInnerUp', 'browDownLeft',
]) {
  assert.ok(morphTargets.has(viseme), `Missing morph target on Head_Mesh: ${viseme}`);
}

// 2. Verify locomotion clip pack (xbot_locomotion.glb + walking.fbx)
const xbotPath = path.join(frontendRoot, 'public/models/xbot_locomotion.glb');
const walkFbxPath = path.join(frontendRoot, 'public/models/walking.fbx');
assert.ok(fs.existsSync(xbotPath), 'xbot_locomotion.glb must exist');
assert.ok(fs.existsSync(walkFbxPath) && fs.statSync(walkFbxPath).size > 100000, 'walking.fbx must exist');
const xbotGltf = parseGlbJson(xbotPath);
const clipNames = new Set((xbotGltf.animations || []).map((a) => a.name));
for (const c of ['idle', 'walk', 'run', 'agree', 'headShake']) {
  assert.ok(clipNames.has(c), `Missing animation clip: ${c}`);
}

// 3. Verify English phoneme-to-viseme engine
const lipsync = new LipsyncEn();
const seq = lipsync.wordsToVisemes(lipsync.preProcessText('INITIALIZING VOLUMETRIC RECONSTRUCTION'));
assert.ok(seq.visemes.length > 8, 'LipsyncEn must produce a multi-phoneme viseme sequence');

// 4. Verify zero browser-side localhost/127.0.0.1 fetch/WebSocket calls in frontend/src
function checkNoLocalhostInBrowserCode(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) checkNoLocalhostInBrowserCode(full);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      const src = fs.readFileSync(full, 'utf8');
      assert.ok(!src.includes('localhost'), `Forbidden localhost reference in ${full}`);
      assert.ok(!src.includes('127.0.0.1'), `Forbidden 127.0.0.1 reference in ${full}`);
    }
  }
}
checkNoLocalhostInBrowserCode(path.join(frontendRoot, 'src'));

console.log('ALL FRONTEND RIG, VISEME, LOCOMOTION & PROXY CHECKS PASSED');
