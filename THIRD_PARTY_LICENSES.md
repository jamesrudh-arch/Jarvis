# Third-Party Asset & Software Licenses

JARVIS NEXUS ships only verified, permissively licensed open-source 3D character, rig, animation, and engine assets. No ripped, proprietary, or unlicensed assets are included.

## 1. Rigged Adult Female 3D Character (`frontend/public/models/jarvis_avaturn.glb`) & Female Walk Cycle (`frontend/public/models/walking.fbx`) & Retargeting / Viseme Reference
- **Source Repository**: [`met4citizen/TalkingHead`](https://github.com/met4citizen/TalkingHead)
- **License**: MIT License
- **Copyright**: Copyright (c) 2023-2024 Mika Suominen
- **Modifications in JARVIS NEXUS**: Runtime PBR material tailoring (charcoal-slate structured studio suit `#1C252E`, midnight-slate inner knit `#0D1721`, dark espresso hair `#231814`, matte obsidian ankle boots `#101419`, physical skin sheen calibration) and skeletal locomotion integration.

## 2. Humanoid Mixamo-Compatible Locomotion & Gesture Clips (`frontend/public/models/xbot_locomotion.glb`)
- **Source Repository**: [`mrdoob/three.js`](https://github.com/mrdoob/three.js) (`examples/models/gltf/Xbot.glb`)
- **License**: MIT License
- **Copyright**: Copyright (c) 2010-2025 three.js authors
- **Usage**: Skeletal animation tracks (`idle`, `walk`, `run`, `agree`, `headShake`) retargeted in-engine onto JARVIS's 66-bone humanoid skeleton with zeroed root X/Z drift for skate-free ground locomotion.

## 3. Real-Time 3D Engine (`three`)
- **Source**: [`mrdoob/three.js`](https://github.com/mrdoob/three.js)
- **License**: MIT License
