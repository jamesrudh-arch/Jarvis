# JARVIS NEXUS — Phase Zero Inspection & Approved Pre-Production Baseline

**Status**: Approved by Owner — Active Visual & Behavioural Baseline.

---

## 1. Repository Inspection Summary (Pre-Implementation State)
- **Initial Contents**: Single `README.md` (`# Jarvis`, commit `1f1f1ad` on `main`).
- **Pre-existing Functional Code**: None; clean greenfield repository.
- **Retained Assets**: Original `README.md` history and branch lineage (`arena/3bdc7997-jarvis`).
- **Environment & Constraints**:
  - Sandbox hardware: 2 vCPU Intel Xeon @ 2.60 GHz, 3.8 GiB RAM, no local NVIDIA GPU (`nvidia-smi` absent), `ffmpeg` and `psql` binaries not preinstalled in sandbox container.
  - Consequence for Engineering Integrity: CORE supports PostgreSQL + `pgvector` in production via `DATABASE_URL` and SQLite in local dev/test; Local PC CUDA 4-bit worker (`huihui-ai/Qwen2.5-14B-Instruct-abliterated`) and Private Kaggle GPU worker connect over authenticated `/ws/worker`. When no GPU worker is connected, CORE truthfully reports inference unavailability without fabricating neural outputs.

---

## 2. Character Direction Baseline
- **Presentation**: Realistic poised adult woman (~34), perceptive, articulate, composed, warm without subservience, direct without coldness.
- **Visual Reference**: `docs/preproduction/assets/jarvis_character_reference.jpg`.
- **Face, Hair & Wardrobe**: Dark espresso hair swept back cleanly; tailored charcoal-slate structured jacket (`#1C252E`) over deep midnight mock-neck knit (`#0D1721`), tailored dark slate trousers, matte black ankle boots (`#101419`). Strictly non-sexualised, zero anime/doll styling, zero sci-fi armour/catsuit clichés.
- **Rig, Expressions & Lip-Sync**: 66-bone Mixamo-compatible humanoid skeleton + 72 morph targets across `Head_Mesh`, `Eye_Mesh`, `EyeAO_Mesh`, `Eyelash_Mesh`, `Teeth_Mesh`, and `Tongue_Mesh` (52 ARKit facial shapes + 15 Oculus phoneme visemes `viseme_sil`..`viseme_U`). Expressions: Neutral, Attentive Listening, Analytical Focus, Measured Concern, Decisive Urgency.

---

## 3. Environment Direction Baseline (12 Spatial Zones)
- **Visual Reference**: `docs/preproduction/assets/nexus_environment_overview.jpg`.
- **Palette**: `#02070B` obsidian structural shell, `#06121A` rough-hewn basalt monoliths & honed dark slate floor, `#62E6F2` primary optical cyan (used selectively for active volumetric projections), `#DDFBFF` ice-white verified facts/highlights, `#7799A5` muted instrumentation text, `#E7AE5B` warning/hypothesis amber, `#FF6B67` sparse critical red.
- **12 Navigable Zones**:
  1. Central Operations Holo-Ring `(0, 0, 0)`
  2. Volumetric Simulation & Scenario Stage `(0, 0, 1.8)`
  3. Memory Archive Crystalline Colonnade `(-7.5, 0, -1.5)`
  4. Live Research Alcove `(-6.2, 0, -6.8)`
  5. Goals & Ongoing Projects Bay `(-3.2, 0, -8.2)`
  6. Multi-Agent Collaboration Table `(3.2, 0, -8.2)`
  7. Frameless Architectural Media & Video Wall `(6.8, 0, -5.8)`
  8. Defensive Security Vault `(8.0, 0, 0.5)`
  9. Vision & Optical Input Station `(6.8, 0, 5.2)`
  10. Diagnostics & Telemetry Station `(-6.8, 0, 5.2)`
  11. Local PC & Private Kaggle Compute Bay `(3.2, 0, 7.8)`
  12. Owner Power Switches & Embodiment Projection Pedestal `(-3.2, 0, 7.8)`

---

## 4. Approved Visual Storyboard Plates (`docs/preproduction/storyboard/`)
1. **First Wake** — `sb_01_first_wake.jpg`: Restrained dawn-up of Central Operations; truthful CORE initialization.
2. **Normal Living Presence** — `sb_02_living_presence.jpg`: Quiet authorised work on volumetric turbine/architecture assembly.
3. **Walking Towards Central Operations** — `sb_03_walking_conversing.jpg`: Grounded heel-to-toe stride (`1.32 m/s`), zero foot-skating, conversing mid-motion.
4. **Turning to Acknowledge Owner** — `sb_04_turning_acknowledge.jpg`: Gaze-first interruption mid-task; task pushed to resumable stack.
5. **Conversational Focus** — `sb_05_conversational_focus.jpg`: Eye-level 65mm medium-close dialogue across obsidian holo-table.
6. **Working at a Spatial Console** — `assets/jarvis_character_reference.jpg`: Direct hand manipulation of volumetric 3D assembly with interactive cyan light spill.
7. **Urgent Alert Movement** — `sb_07_urgent_alert.jpg`: Brisk `3.25 m/s` run/urgent stride toward Security Vault with `#E7AE5B`/`#FF6B67` vector isolation.
8. **Memory Exploration** — `sb_08_memory_archive.jpg`: Optical glass columns separating `#DDFBFF` verified facts from `#E7AE5B` hypotheses.
9. **Goals & Ongoing Work** — `sb_09_goals_ongoing_work.jpg`: Z-depth dependency DAG & milestone gates.
10. **Multi-Agent Collaboration** — `sb_10_multi_agent_research.jpg`: Geometric icosahedral specialist-agent workspaces at radial holo-table.
11. **Live Research** — `sb_11_live_research.jpg`: Primary literature planes, empirical curves, and provenance links.
12. **Parallel Simulation** — `sb_12_simulation.jpg`: Side-by-side Variant A (laminar `#62E6F2`) vs Variant B (turbulent `#E7AE5B`) 3D comparison.
13. **Constructing an Interactive Scenario ("Let Me Show You")** — `sb_13_scenario_construction.jpg`: Expanding tabletop schematic into room-scale 3D LiDAR/wireframe scene.
14. **Directing a Forensic Scenario** — `sb_14_scenario_directing.jpg`: Walking inside paused room-scale voxel cloud with wireframe actors, amber causal vector, and time scrubbing.
15. **Presenting & Pausing Video -> 3D Breakdown** — `sb_15_video_to_3d_presentation.jpg`: Standing beside Media Wall, extracting a 3D volumetric twin from a paused frame.
16. **Vision & Defensive Security** — `sb_16_vision_security.jpg`: Explicit `OPTICAL INPUT: ACTIVE` plane + defensive boundary lattice.
17. **Local PC & Private Kaggle Connection** — `sb_17_local_kaggle_compute.jpg`: Local 4-bit CUDA primary node + 6 encrypted Kaggle profile slots over outbound WebSocket.
18. **Owner Power & Privacy Controls** — `sb_18_owner_privacy_switches.jpg`: 7 hardware-enforced switches (Master, Mic, Camera, Autonomy, Remote Compute, Computer Control, Embodiment).
19. **Mobile Companion & 20. Live Holographic Projection** — `sb_20_holographic_projection.jpg`: Synchronized live 3D mobile companion & 45° Pepper's Ghost / 4-face holographic prism output.
