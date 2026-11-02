# Local review: November 1 website update

The site is prepared for local review; no commit or push was made.

## Content

- Paper: Desktop `sbl-arxiv-v2-view.pdf` (October 30), copied to the existing public PDF URL. Author order, equal-contribution marks, correspondence marks, affiliation summary and BibTeX author list follow this version.
- HPLC: Desktop `hplc-self-building-lab-revised.mp4`.
- RoboChem-Flex: Desktop `robochem-flex-revision-8.mp4`.
- The physical-experiment film, fluorescence data and both original 3D workflows remain available. The top main film was subsequently replaced with Episode 1.

The header now pairs the project title with laboratory footage, with compact paper credits below. Experiment films use consistent image/copy rows. Three accessible tabs select the interactive workflows. The existing dark-blue research identity is retained. `source/refinement.css` isolates landing-page refinements from the embedded viewers.

## Video encoding

Both new films retain 1920×1080 resolution, 30 fps and the original AAC audio stream. Encoding uses H.264, CRF 20, the slow preset, yuv420p and MP4 faststart. The originals remain untouched on Desktop.

| Film | Output | Reduction | Sampled VMAF mean |
| --- | ---: | ---: | ---: |
| HPLC | 50.8 MiB | 26.1% | 99.25 |
| RoboChem-Flex | 34.6 MiB | 24.1% | 98.75 |

Quality was compared against the supplied videos at one frame per second across their full durations. These are lossy encodes, not a claim of identical pixels. Full hashes, settings and score summaries are in `media/provenance.json`.

## HPLC replay

The third viewer uses `hplc-video-20261030-twin-v6-input/workflow.json` and the corresponding rendered scene `hplc-video-20261030-twin-v6-native/initial-scene.usdc`. The source scene hash is checked against the workflow before export. Saved sparse state is merged in chronological order; factory-calibrated forward kinematics supplies robot and gripper poses. Plates and drawer follow the saved world transforms.

The replay is sampled at 5 Hz and exported through Blender to Draco-compressed glTF. Browser interpolation makes playback smooth; it is a visualization, not new physics validation. Duration: 834.4 seconds. The 8.2 MiB model is embedded into a roughly 12.7 MiB standalone viewer. Source hashes and export details are in `source/assets/hplc-workflow.json`.

## Review and build

Use Node 22 or newer, then `npm ci` and `npm run build`. Open generated `index.html`, or run `python3 -m http.server 8876` in the repository and visit `http://localhost:8876/`.

Checks: `npm run check`, `npm run check:results`, `npm run check:publish`, `node scripts/check-website.mjs`, `node scripts/check-new-media.mjs`, and `node scripts/check-hplc.mjs`. The latter two accept `BASE_URL`; browser checks use local Chrome and software WebGL. Screenshots are saved under ignored `artifacts/`.

Impeccable was cloned to the sibling `impeccable/` directory. Its polish and craft-floor guidance informed the work. Mechanical scan findings were reviewed: table-wrapper padding is supplied by cells, tabs explicitly have zero corner radius, the fluorescence exclusion stripe encodes missing data, and the author-credit separator is a horizontal rule rather than a bordered container. Small contribution notes and HPLC caption contrast were improved. The cloned toolkit is not included in the website build.

## Validation results

JavaScript syntax checks, fluorescence-data checks, all four video metadata/seeking checks, both new films' playback checks, and GitHub-size/local-reference checks passed. The original website browser suite passed for both existing 3D workflows with visible shaded geometry and no JavaScript errors. The HPLC browser suite passed for the animated scene (10 clips / 18 tracks), seek positions, chapter navigation, hidden-tab pausing, keyboard tabs, and layouts at 390, 768 and 1440 pixels. Rendered scene and workflow hashes also match the source renderer's provenance.

## Fume hood restored

The HPLC viewer now also embeds `source/assets/hplc-hood.glb`, exported from `/root/hood_ROOT` and `/Motion/hood/sash` in the same rendered USD scene. This restores the cabinet, worktop, accessories and raised sash at their original world positions. It is loaded alongside the original animated model, preserving all replay tracks. The hood asset hash is recorded in the workflow metadata.

## Main film replaced with Episode 1

The top video now uses Desktop `sbl_youtube/self-building-labs-episode-1-layout-b.mp4`, compressed to `self-building-labs-episode-1.mp4`. The 151-second film retains 1080p, 30 fps and its original audio. CRF 20 / slow H.264 encoding reduces it from 101.8 MiB to 47.7 MiB; sampled mean VMAF is 98.64. English captions are preserved and exposed as a selectable browser track. The poster is extracted from the new film at 55 seconds. The superseded public v8 file was moved outside the repository to `/tmp/sbl-episode-1-review/previous-main-video.mp4`. Browser playback, seeking, all 33 caption cues, duration, resolution and publication size checks passed. No push was made.

The HPLC tab now starts in the full-lab camera view so the fume hood is visible immediately. Its iframe URL carries a content-derived version computed from the HPLC source, replay assets, hood asset and shared rendering files, preventing reuse of an older cached viewer after changes.

## Shared hood and rendering correction

The earlier simple hood from the HPLC native scene has been replaced by the complete detailed hood from the original website scene `/tmp/sbl-latest-workflow.usdc`. The complete cabinet, rear panels, black worktop, front vents, colored service fittings, accessories and sash are included. The hood is placed using the HPLC scene's measured hood transform.

HPLC now uses the quantum-dot viewer's light positions, shadow extent, AgX exposure, environment, pixel-ratio cap and field of view. Equipment materials are matched to a palette extracted from `latest-workflow.glb`, with explicit equivalents for the newer robot/OT-2 material names. The three instrument photo texture maps were verified byte-identical to those in the original viewer. Robot housing normals are smoothed with a 60-degree crease threshold, retaining hard mechanical edges. The duplicated imported ground is hidden in favor of the shared renderer's ground.

## Shared browser assets

The build now emits small HTML pages and content-hashed files under `site-assets/`.
All three workflows import shared ES module chunks (Three.js, rendering, controls,
and model loading), the same font/style files, and one Draco decoder directory.
Identical model buffer payloads and textures are extracted once, without recompression.
The hood buffer contains both the existing optimized scene parts and the detailed
HPLC hood, preserving each scene's transforms and geometry; this avoids deleting
cabinet geometry that is merged into other meshes in the original exports.
The original editable GLBs remain in `source/assets/`.

Model payloads total 22.6 MiB versus 36.9 MiB in the five source GLBs. The three
HTML documents now total about 28 KiB, instead of embedding base64 model/library/font
copies. This figure excludes video media and does not measure cold-load time.

Run `npm run build` for all pages together (partial builds are no longer used),
then `npm run serve` and open http://localhost:8877/. ES modules and external model
requests require HTTP, so opening the generated HTML directly with file:// is no
longer supported. Publish `site-assets/` alongside the HTML whenever publishing is
approved. Hashed URLs allow reuse under the hosting service's cache policy;
the local preview server gives them immutable caching and revalidates HTML.
`npm run check:shared` verifies exact model binary and texture preservation.

Validation: lossless checks passed for 2,512 binary views and 40 image references.
The HPLC browser check passed (145 hood meshes, 10 clips, 18 tracks). The other
two workflows passed shaded-geometry, playback, and mobile-layout checks without
JavaScript errors. `npm run check:cache` confirmed browser disk-cache reuse across
pages for the hood, geometry, a texture, a font, and a shared JavaScript module.
Nothing was committed or pushed.

## HPLC drawer-opening transform correction

The two user-designated workflows are identical: `hplc-video-20261030-twin-v6-input/workflow.json`
and `hplc-controller-export-20261028/outputs/hplc-speedup-20261028/retime-v2-20261029/delivery/workflow.json`
both hash to `13f654af7a182a2bcd7f7c0c40b2dab9a819925fd19ce90485eb72c29d7ccda2`.
The replay source was correct, but the Blender USD import lost `resetXformStack`
semantics on nine robot nodes. Their world-space transforms inherited the robot
parent's approximately -20 mm vertical installation offset a second time, placing
the arm and fingers below their intended positions relative to the HPLC drawer.

`scripts/fix-hplc-transforms.py` restores those nodes as scene roots, retaining the
static base hierarchy and copying geometry, textures, and animation buffers
verbatim. `scripts/check-hplc-source-motion.py` compares all 4,173 exported 5 Hz
frames with calibrated FK and saved plate/drawer transforms from the authoritative
inputs. Maximum position error after correction is below 0.001 mm. This verifies
export fidelity at saved frames; it does not add physical or continuous-time
collision qualification. The source trajectory and current lighting/hood remain
unchanged.

Run the source comparison using the local CUDA/pxr environment:
`/home/safety_agent/venvs/curobo-performance/bin/python scripts/check-hplc-source-motion.py`.
The `HPLC_INPUT` and `HPLC_DELIVERY` environment variables can override source paths.
